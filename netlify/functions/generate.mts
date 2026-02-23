import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// ---- CONFIGURATION ----
const TIER_LIMITS: Record<string, number> = { free: 3, pro: 10, max: 999 };
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

  const { type, jobTitle, company, jobDescription, experience, skills, education, tone, industry, masterProfile, highlights } = body;

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

  // ---- CHECK TIER STATUS ----
  let tier = "free";
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    tier = await checkTier(authHeader);
  }
  const dailyLimit = TIER_LIMITS[tier] || TIER_LIMITS.free;

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

    // Check daily tier limit
    const dailyData = await store.get(rateLimitKey, { type: "json" });
    const dailyCount = dailyData?.count || 0;

    if (dailyCount >= dailyLimit) {
      return new Response(
        JSON.stringify({
          error: tier === "free"
            ? "You've reached your 3 free daily generations. Upgrade for more!"
            : `You've reached your ${dailyLimit} daily generations. Upgrade to Max for unlimited!`,
          limitReached: true,
          tier,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // ---- GENERATE WITH ANTHROPIC ----
    const hasMasterProfile = masterProfile && masterProfile.fullName;

    const resumeSystemPrompt = hasMasterProfile
      ? `You are an expert resume writer. Generate a resume using EXACTLY this template format. Do NOT deviate. Do NOT use markdown like ** or ##.

TEMPLATE FORMAT:
[FULL NAME IN ALL CAPS]
[EMAIL] | [PHONE] | [LINKEDIN URL]

PROFESSIONAL EXPERIENCE
[Company Name]                                    [Month Year – Month Year or Present]
[Job Title]
• [Achievement bullet with metrics]
• [Achievement bullet with metrics]

[Repeat for each role, most recent first]

LEADERSHIP
[Organization Name]                               [Month Year – Month Year]
[Role Title]
• [Achievement bullet]

EDUCATION
[School Name]
[Degree details, honors, minors]

CERTIFICATIONS & SKILLS
Certifications: [comma-separated list]
Software: [comma-separated list]
Languages: [comma-separated list]

Rules:
- Company name is BOLD, dates are ITALIC right-aligned on the same line
- Job title is ITALIC on the next line below company
- Use strong action verbs, quantify achievements with metrics
- Prioritize skills and achievements relevant to the TARGET JOB
- Keep to 1 page of content
- Do NOT invent experience or skills not in the source data
- Do NOT add PROFESSIONAL SUMMARY section — go straight to experience
- Include HONORS & AWARDS and PUBLICATIONS only if the candidate has them`
      : `You are an expert resume writer. Create an ATS-optimized resume. Use this exact format:

[FULL NAME IN ALL CAPS]
[Contact info separated by pipes |]

PROFESSIONAL EXPERIENCE
[Company]                                         [Dates]
[Title]
• [Achievement with metrics]

EDUCATION
[School]
[Degree]

CERTIFICATIONS & SKILLS
Software: [list]
Languages: [list]

Do NOT use markdown like ** or ##. Company names should be on the same line as dates. Job titles on the next line. Use strong action verbs and quantify achievements.`;

    const coverLetterSystemPrompt = `You are an expert cover letter writer. Write a compelling, personalized cover letter for the specified job. It should be 3-4 paragraphs, demonstrate knowledge of the company, highlight relevant experience, and end with a strong call to action. Output clean formatted text. Do NOT use markdown syntax like ** or ##.`;

    const systemPrompt = type === "resume" ? resumeSystemPrompt : coverLetterSystemPrompt;

    let userMessage: string;
    if (type === "resume" && hasMasterProfile) {
      const mp = masterProfile;
      const expText = (mp.experience || []).map((e: any) =>
        `${e.title} at ${e.company} (${e.startDate} - ${e.endDate})${e.location ? `, ${e.location}` : ''}\n${(e.bullets || []).map((b: string) => `• ${b}`).join('\n')}`
      ).join('\n\n');
      const eduText = (mp.education || []).map((e: any) =>
        `${e.degree}, ${e.school} (${e.year})${e.gpa ? ` GPA: ${e.gpa}` : ''}`
      ).join('\n');
      const certText = (mp.certifications || []).join(', ');

      userMessage = `Generate a ${(tone || "professional").toLowerCase()} resume for a ${jobTitle} position${company ? ` at ${company}` : ""} in the ${industry || "general"} industry.

CANDIDATE INFO:
Name: ${mp.fullName}
Email: ${mp.email || 'Not provided'}
Phone: ${mp.phone || 'Not provided'}
Location: ${mp.location || 'Not provided'}

EXPERIENCE:
${expText || experience || 'Not provided'}

SKILLS TO EMPHASIZE:
${skills || (mp.skills || []).join(', ')}

EDUCATION:
${eduText || education || 'Not provided'}

${certText ? `CERTIFICATIONS:\n${certText}` : ''}

${jobDescription ? `TARGET JOB DESCRIPTION:\n${jobDescription}` : ''}

${highlights ? `SPECIFIC HIGHLIGHTS TO INCLUDE:\n${highlights}` : ''}`;
    } else if (type === "resume") {
      userMessage = `Create a ${(tone || "professional").toLowerCase()} resume for a ${jobTitle} position${company ? ` at ${company}` : ""} in the ${industry || "general"} industry.

Job Description: ${jobDescription || "Not provided"}

My Experience: ${experience}

My Skills: ${skills}

My Education: ${education || "Not provided"}

${highlights ? `Specific highlights: ${highlights}` : ''}`;
    } else {
      userMessage = `Write a ${(tone || "professional").toLowerCase()} cover letter for a ${jobTitle} position${company ? ` at ${company}` : ""} in the ${industry || "general"} industry.

Job Description: ${jobDescription || "Not provided"}

My Experience: ${experience}

My Key Skills: ${skills}

My Education: ${education || "Not provided"}`;
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
      JSON.stringify({
        result: text,
        remaining: dailyLimit - dailyCount - 1,
        tier,
      }),
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

async function checkTier(authHeader: string): Promise<string> {
  try {
    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Netlify.env.get("SUPABASE_URL");
    const supabaseServiceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) return "free";
    // Get user first (needed for profile lookup)
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseServiceKey },
    });
    if (!userRes.ok) return "free";
    const user = await userRes.json();
    // Profile fetch with 5s timeout to avoid hanging
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const profileRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=is_pro,tier`,
        { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }, signal: controller.signal }
      );
      clearTimeout(timeout);
      if (!profileRes.ok) return "free";
      const profiles = await profileRes.json();
      if (profiles.length === 0) return "free";
      const p = profiles[0];
      if (p.tier) return p.tier;
      return p.is_pro ? "pro" : "free";
    } catch { clearTimeout(timeout); return "free"; }
  } catch { return "free"; }
}

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
