import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const FREE_DAILY_LIMIT = 1;

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "API key not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { resumeContent, jobDescription } = body;
  if (!resumeContent) {
    return new Response(
      JSON.stringify({ error: "Missing resume content" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // ---- CHECK PRO STATUS ----
  let isPro = false;
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    isPro = await checkProStatus(authHeader);
  }

  // ---- RATE LIMITING ----
  const clientIp = context.ip || req.headers.get("x-forwarded-for") || "unknown";
  const ipHash = await hashIp(clientIp);
  const today = new Date().toISOString().split("T")[0];
  const rateLimitKey = `ats:${ipHash}:${today}`;

  try {
    const store = getStore("rate-limits");
    const dailyData = await store.get(rateLimitKey, { type: "json" });
    const dailyCount = dailyData?.count || 0;

    if (!isPro && dailyCount >= FREE_DAILY_LIMIT) {
      return new Response(
        JSON.stringify({
          error: "You've used your free ATS check today. Upgrade to Pro for unlimited checks!",
          limitReached: true,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // ---- ANALYZE WITH CLAUDE ----
    const systemPrompt = `You are an expert ATS (Applicant Tracking System) analyzer. Analyze the resume against the job description (if provided) and return a JSON response with this exact structure:
{
  "score": <number 0-100>,
  "summary": "<1-2 sentence overall assessment>",
  "keywordMatch": {
    "score": <number 0-100>,
    "found": ["keyword1", "keyword2"],
    "missing": ["keyword3", "keyword4"]
  },
  "formatting": {
    "score": <number 0-100>,
    "issues": ["issue1", "issue2"]
  },
  "sections": {
    "score": <number 0-100>,
    "present": ["section1", "section2"],
    "missing": ["section3"]
  },
  "improvements": ["suggestion1", "suggestion2", "suggestion3"]
}
Return ONLY valid JSON, no markdown or explanation.`;

    const userMessage = jobDescription
      ? `Analyze this resume for ATS compatibility against the following job description.

RESUME:
${resumeContent}

JOB DESCRIPTION:
${jobDescription}`
      : `Analyze this resume for general ATS compatibility.

RESUME:
${resumeContent}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      console.error("Anthropic API error:", await response.text());
      return new Response(
        JSON.stringify({ error: "ATS analysis failed. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const text = data.content?.map((b: any) => b.text || "").join("") || "";

    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch {
      // If Claude didn't return valid JSON, try to extract it
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Invalid analysis response");
      }
    }

    // Update usage count
    await store.setJSON(rateLimitKey, { count: dailyCount + 1, date: today });

    return new Response(
      JSON.stringify({
        analysis,
        remaining: isPro ? 999 : FREE_DAILY_LIMIT - dailyCount - 1,
        isPro,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ATS score error:", err);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

async function checkProStatus(authHeader: string): Promise<boolean> {
  try {
    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Netlify.env.get("SUPABASE_URL");
    const supabaseServiceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) return false;

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseServiceKey },
    });
    if (!userRes.ok) return false;
    const user = await userRes.json();

    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=is_pro`,
      { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }
    );
    if (!profileRes.ok) return false;
    const profiles = await profileRes.json();
    return profiles.length > 0 && profiles[0].is_pro;
  } catch {
    return false;
  }
}

async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + "resumeai-salt-2025");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
}

export const config: Config = {
  path: "/api/ats-score",
};
