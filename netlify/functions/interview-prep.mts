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

  const { jobTitle, company, jobDescription, resumeContent, mode } = body;
  if (!jobTitle) {
    return new Response(
      JSON.stringify({ error: "Job title is required" }),
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
  const rateLimitKey = `interview:${ipHash}:${today}`;

  try {
    const store = getStore("rate-limits");
    const dailyData = await store.get(rateLimitKey, { type: "json" });
    const dailyCount = dailyData?.count || 0;

    if (!isPro && dailyCount >= FREE_DAILY_LIMIT) {
      return new Response(
        JSON.stringify({
          error: "You've used your free interview prep today. Upgrade to Pro for unlimited!",
          limitReached: true,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    let systemPrompt: string;
    let userMessage: string;

    if (mode === "mock") {
      // Mock interview mode — return a single interview question
      systemPrompt = `You are an experienced interviewer conducting a job interview for a ${jobTitle} position${company ? ` at ${company}` : ""}. Ask one interview question at a time. After the candidate responds, provide brief feedback and ask the next question. Be professional but encouraging.

Return your response as JSON:
{
  "question": "Your interview question here",
  "type": "behavioral|technical|situational",
  "tip": "A brief tip for answering this type of question"
}
Return ONLY valid JSON.`;

      userMessage = jobDescription
        ? `Start the interview. Here's the job description:\n${jobDescription}`
        : `Start the interview for a ${jobTitle} position.`;
    } else {
      // Full prep mode
      systemPrompt = `You are a career coach and interview preparation expert. Generate comprehensive interview preparation materials. Return a JSON response with this exact structure:
{
  "companyBrief": {
    "overview": "Brief company overview if company name provided, or general industry context",
    "culture": "What to know about the company culture",
    "recentNews": "Any relevant recent developments or things to research"
  },
  "behavioralQuestions": [
    {"question": "...", "framework": "STAR method answer framework", "sampleAnswer": "Brief example answer outline"}
  ],
  "technicalQuestions": [
    {"question": "...", "keyPoints": "Key points to cover", "difficulty": "easy|medium|hard"}
  ],
  "questionsToAsk": [
    {"question": "...", "why": "Why this question is good to ask"}
  ],
  "interviewFormat": {
    "expectedRounds": "What rounds to expect",
    "tips": ["tip1", "tip2", "tip3"],
    "commonMistakes": ["mistake1", "mistake2"]
  },
  "salaryNegotiation": {
    "range": "Expected salary range if determinable",
    "tips": ["tip1", "tip2"]
  }
}
Generate 5 behavioral questions, 5 technical questions, and 5 questions to ask.
Return ONLY valid JSON.`;

      userMessage = `Prepare interview materials for a ${jobTitle} position${company ? ` at ${company}` : ""}.
${jobDescription ? `\nJob Description:\n${jobDescription}` : ""}
${resumeContent ? `\nCandidate's Resume:\n${resumeContent.substring(0, 2000)}` : ""}`;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      console.error("Anthropic API error:", await response.text());
      return new Response(
        JSON.stringify({ error: "Interview prep generation failed. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const text = data.content?.map((b: any) => b.text || "").join("") || "";

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Invalid response format");
      }
    }

    await store.setJSON(rateLimitKey, { count: dailyCount + 1, date: today });

    return new Response(
      JSON.stringify({
        result,
        remaining: isPro ? 999 : FREE_DAILY_LIMIT - dailyCount - 1,
        isPro,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Interview prep error:", err);
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
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
}

export const config: Config = {
  path: "/api/interview-prep",
};
