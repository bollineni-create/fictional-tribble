import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const FREE_DAILY_LIMIT = 1;

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
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
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const { currentResume, jobDescription, masterProfile } = body;
  if (!currentResume || !jobDescription) {
    return new Response(
      JSON.stringify({ error: "Resume content and job description are required" }),
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
  const rateLimitKey = `tailor:${ipHash}:${today}`;

  try {
    const store = getStore("rate-limits");
    const dailyData = await store.get(rateLimitKey, { type: "json" });
    const dailyCount = dailyData?.count || 0;

    if (!isPro && dailyCount >= FREE_DAILY_LIMIT) {
      return new Response(
        JSON.stringify({
          error: "You've used your free resume tailoring today. Upgrade to Pro for unlimited!",
          limitReached: true,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an expert resume tailor. Given a current resume and a target job description, you must:

1. Analyze the gap between what the resume shows and what the job requires
2. Generate a TAILORED version of the resume that better matches the job
3. List the specific changes made and why

Return ONLY valid JSON with this structure:
{
  "tailoredResume": "The full tailored resume text using the standard template format",
  "changes": [
    {"section": "PROFESSIONAL SUMMARY", "description": "Reworded to emphasize X relevant to the role"},
    {"section": "EXPERIENCE", "description": "Added bullet highlighting Y achievement"},
    {"section": "SKILLS", "description": "Reordered to prioritize job-relevant skills"}
  ],
  "gapAnalysis": {
    "missingSkills": ["skill1", "skill2"],
    "strongMatches": ["skill3", "skill4"],
    "suggestions": ["Consider getting certified in X", "Highlight any experience with Y"]
  },
  "matchImprovement": "Estimated improvement description"
}

Rules:
- NEVER fabricate experience or skills the candidate doesn't have
- DO reorder, reword, and emphasize existing content to better match the job
- The tailored resume must use the same standard template format
- Focus on ATS-friendly language that mirrors the job description keywords
- Keep the resume truthful — only enhance presentation, not content`;

    const userMessage = `CURRENT RESUME:
${currentResume}

TARGET JOB DESCRIPTION:
${jobDescription}

${masterProfile ? `ADDITIONAL CANDIDATE INFO (skills, experience):
${JSON.stringify(masterProfile)}` : ''}

Please tailor this resume for the target job.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      console.error("Anthropic API error:", await response.text());
      return new Response(
        JSON.stringify({ error: "AI tailoring failed. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const rawText = data.content?.map((b: any) => b.text || "").join("") || "";

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse AI response");
      }
    }

    await store.setJSON(rateLimitKey, { count: dailyCount + 1, date: today });

    return new Response(
      JSON.stringify({
        result: parsed,
        remaining: isPro ? 999 : FREE_DAILY_LIMIT - dailyCount - 1,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Tailor resume error:", err);
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
  } catch { return false; }
}

async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + "resumeai-salt-2025");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 16);
}

export const config: Config = {
  path: "/api/tailor-resume",
};
