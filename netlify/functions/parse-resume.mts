import type { Context, Config } from "@netlify/functions";

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

  // ---- AUTH REQUIRED ----
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  let userId: string | null = null;
  try {
    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Netlify.env.get("SUPABASE_URL");
    const supabaseServiceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl) {
      return new Response(
        JSON.stringify({ error: "Server config error: SUPABASE_URL not set. Please add it in Netlify env vars." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    if (!supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Server config error: SUPABASE_SERVICE_ROLE_KEY not set. Please add it in Netlify env vars." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseServiceKey },
    });
    if (!userRes.ok) {
      const errText = await userRes.text();
      console.error("Supabase auth failed:", userRes.status, errText);
      return new Response(
        JSON.stringify({ error: `Auth failed (${userRes.status}): Your session may have expired. Please sign out and sign back in.` }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    const user = await userRes.json();
    userId = user.id;
  } catch (authErr: any) {
    console.error("Auth error:", authErr.message);
    return new Response(
      JSON.stringify({ error: `Auth error: ${authErr.message}` }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // ---- PARSE BODY ----
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { resumeText } = body;
  if (!resumeText || typeof resumeText !== "string" || resumeText.trim().length < 50) {
    return new Response(
      JSON.stringify({ error: "Resume text is too short or missing" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (resumeText.length > 20000) {
    return new Response(
      JSON.stringify({ error: "Resume text is too long (max 20,000 characters)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // ---- AI EXTRACTION ----
  try {
    const systemPrompt = `You are an expert resume parser. Extract structured data from the resume text provided. Return ONLY valid JSON with no markdown formatting, no code blocks, no extra text.

The JSON must have this exact structure:
{
  "fullName": "string",
  "email": "string or null",
  "phone": "string or null",
  "location": "string or null",
  "summary": "string or null (professional summary if present)",
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "startDate": "Start date as written",
      "endDate": "End date as written or Present",
      "location": "City, State or null",
      "bullets": ["Achievement 1", "Achievement 2"]
    }
  ],
  "education": [
    {
      "degree": "Degree name",
      "school": "School name",
      "year": "Graduation year or date range",
      "gpa": "GPA if listed or null"
    }
  ],
  "skills": ["Skill1", "Skill2", "Skill3"],
  "certifications": ["Cert1", "Cert2"]
}

Rules:
- Extract ALL experience entries, even if formatting is inconsistent
- Skills should be individual items, not comma-separated strings
- If a section is missing, use an empty array [] or null
- Do NOT invent or fabricate any data — only extract what's present
- For the summary, use the professional summary/objective if present, otherwise null`;

    // 30-second timeout to prevent indefinite hanging
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: "user", content: `Parse this resume:\n\n${resumeText}` }],
        }),
      });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      if (fetchErr.name === 'AbortError') {
        return new Response(
          JSON.stringify({ error: "Resume parsing timed out. Please try again." }),
          { status: 504, headers: { "Content-Type": "application/json" } }
        );
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.error("Anthropic API error:", await response.text());
      return new Response(
        JSON.stringify({ error: "AI parsing failed. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const rawText = data.content?.map((b: any) => b.text || "").join("") || "";

    // Parse the JSON from Claude's response
    let parsed: any;
    try {
      // Try direct parse first
      parsed = JSON.parse(rawText);
    } catch {
      // Try extracting JSON from possible markdown code block
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse AI response as JSON");
      }
    }

    // ---- SAVE TO SUPABASE ----
    const supabaseUrl = Netlify.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Upsert the extended profile
    const upsertRes = await fetch(
      `${supabaseUrl}/rest/v1/user_profiles_extended`,
      {
        method: "POST",
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          user_id: userId,
          full_name: parsed.fullName || null,
          email: parsed.email || null,
          phone: parsed.phone || null,
          location: parsed.location || null,
          summary: parsed.summary || null,
          experience: parsed.experience || [],
          education: parsed.education || [],
          skills: parsed.skills || [],
          certifications: parsed.certifications || [],
          raw_resume_text: resumeText.substring(0, 10000),
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (!upsertRes.ok) {
      console.error("Supabase upsert error:", await upsertRes.text());
      // Still return the parsed data even if save fails
    }

    return new Response(
      JSON.stringify({ profile: parsed, saved: upsertRes.ok }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Parse resume error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to parse resume. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config: Config = {
  path: "/api/parse-resume",
};
