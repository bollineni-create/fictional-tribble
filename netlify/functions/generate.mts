import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// ---- CONFIGURATION ----
const FREE_DAILY_LIMIT = 3;
const MAX_REQUESTS_PER_MINUTE = 5;
const MAX_INPUT_LENGTH = 5000;

export default async (req: Request, context: Context) => {
  // ---- ABUSE PROTECTION: Method check ----
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ---- ABUSE PROTECTION: Bot detection ----
  const userAgent = req.headers.get("user-agent") || "";
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/json") || !userAgent || userAgent.length < 10) {
    return new Response(
      JSON.stringify({ error: "Invalid request" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // ---- API KEY CHECK ----
  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "API key not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // ---- PARSE & VALIDATE INPUT ----
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { type, jobTitle, company, jobDescription, experience, skills, education, tone, industry } = body;

  if (!type || !jobTitle || !experience || !skills) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Validate field lengths to prevent abuse
  const fields = { jobTitle, company, jobDescription, experience, skills, education };
  for (const [name, value] of Object.entries(fields)) {
    if (value && typeof value === "string" && value.length > MAX_INPUT_LENGTH) {
      return new Response(
        JSON.stringify({ error: `${name} is too long (max ${MAX_INPUT_LENGTH} characters)` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // ---- SERVER-SIDE RATE LIMITING ----
  const clientIp = context.ip || req.headers.get("x-forwarded-for") || "unknown";
  const ipHash = await hashIp(clientIp);
  const today = new Date().toISOString().split("T")[0];
  const rateLimitKey = `rate:${ipHash}:${today}`;
  const minuteKey = `burst:${ipHash}`;

  try {
    const store = getStore("rate-limits");

    // Check per-minute burst limit
    const burstData = await store.get(minuteKey, { type: "json" });
    if (burstData) {
      const elapsed = Date.now() - burstData.timestamp;
      if (elapsed < 60000 && burstData.count >= MAX_REQUESTS_PER_MINUTE) {
        return new Response(
          JSON.stringify({ error: "Too many requests. Please wait a minute and try again." }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
      if (elapsed >= 60000) {
        await store.setJSON(minuteKey, { count: 1, timestamp: Date.now() });
      } else {
        await store.setJSON(minuteKey, { count: burstData.count + 1, timestamp: burstData.timestamp });
      }
    } else {
      await store.setJSON(minuteKey, { count: 1, timestamp: Date.now() });
    }

    // Check daily free limit
    const dailyData = await store.get(rateLimitKey, { type: "json" });
    const dailyCount = dailyData?.count || 0;

    if (dailyCount >= FREE_DAILY_LIMIT) {
      return new Response(
        JSON.stringify({
          error: "You've reached your 3 free daily generations. Upgrade to Pro for unlimited access!",
          limitReached: true,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // ---- GENERATE WITH ANTHROPIC ----
    const systemPrompt =
      type === "resume"
        ? `You are an expert resume writer and career coach. Create a polished, ATS-optimized resume based on the user's information. Format it cleanly with clear sections: PROFESSIONAL SUMMARY, EXPERIENCE, SKILLS, and EDUCATION. Use strong action verbs and quantify achievements where possible. Output clean formatted text. Do NOT use markdown syntax like ** or ##.`
        : `You are an expert cover letter writer. Write a compelling, personalized cover letter for the specified job. It should be 3-4 paragraphs, demonstrate knowledge of the company, highlight relevant experience, and end with a strong call to action. Output clean formatted text. Do NOT use markdown syntax like ** or ##.`;

    const userMessage =
      type === "resume"
        ? `Create a ${(tone || "professional").toLowerCase()} resume for a ${jobTitle} position${company ? ` at ${company}` : ""} in the ${industry || "general"} industry.

Job Description: ${jobDescription || "Not provided"}

My Experience: ${experience}

My Skills: ${skills}

My Education: ${education || "Not provided"}`
        : `Write a ${(tone || "professional").toLowerCase()} cover letter for a ${jobTitle} position${company ? ` at ${company}` : ""} in the ${industry || "general"} industry.

Job Description: ${jobDescription || "Not provided"}

My Experience: ${experience}

My Key Skills: ${skills}

My Education: ${education || "Not provided"}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Anthropic API error:", errorData);
      return new Response(
        JSON.stringify({ error: "AI generation failed. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const text = data.content?.map((b: any) => b.text || "").join("\n") || "";

    // Update usage count only after successful generation
    await store.setJSON(rateLimitKey, { count: dailyCount + 1, date: today });

    return new Response(
      JSON.stringify({ result: text, remaining: FREE_DAILY_LIMIT - dailyCount - 1 }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Function error:", err);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

// Hash IP for privacy - we don't store raw IPs
async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + "resumeai-salt-2025");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
}

export const config: Config = {
  path: "/api/generate",
};

