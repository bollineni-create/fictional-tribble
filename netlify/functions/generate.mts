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

  try {
    const body = await req.json();
    const { type, jobTitle, company, jobDescription, experience, skills, education, tone, industry } = body;

    const systemPrompt =
      type === "resume"
        ? `You are an expert resume writer and career coach. Create a polished, ATS-optimized resume based on the user's information. Format it cleanly with clear sections: PROFESSIONAL SUMMARY, EXPERIENCE, SKILLS, and EDUCATION. Use strong action verbs and quantify achievements where possible. Output clean formatted text. Do NOT use markdown syntax like ** or ##.`
        : `You are an expert cover letter writer. Write a compelling, personalized cover letter for the specified job. It should be 3-4 paragraphs, demonstrate knowledge of the company, highlight relevant experience, and end with a strong call to action. Output clean formatted text. Do NOT use markdown syntax like ** or ##.`;

    const userMessage =
      type === "resume"
        ? `Create a ${tone.toLowerCase()} resume for a ${jobTitle} position${company ? ` at ${company}` : ""} in the ${industry} industry.

Job Description: ${jobDescription || "Not provided"}

My Experience: ${experience}

My Skills: ${skills}

My Education: ${education || "Not provided"}`
        : `Write a ${tone.toLowerCase()} cover letter for a ${jobTitle} position${company ? ` at ${company}` : ""} in the ${industry} industry.

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

    return new Response(JSON.stringify({ result: text }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Function error:", err);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config: Config = {
  path: "/api/generate",
};
