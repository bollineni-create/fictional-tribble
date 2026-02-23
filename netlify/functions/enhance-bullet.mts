import type { Context, Config } from "@netlify/functions";

/**
 * AI Bullet Enhancement — takes a single resume bullet point
 * and rewrites it to be more impactful using strong action verbs,
 * quantified results, and professional language.
 */

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

  const { bullet, jobTitle, company, targetRole } = body;
  if (!bullet || typeof bullet !== "string" || bullet.trim().length < 5) {
    return new Response(
      JSON.stringify({ error: "Bullet text is required (min 5 chars)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const systemPrompt = `You are an expert resume writer. Your task is to enhance a single resume bullet point to make it more impactful and ATS-friendly.

Rules:
- Start with a strong action verb (e.g. Spearheaded, Orchestrated, Streamlined, Automated, Implemented)
- Quantify results with metrics when possible (%, $, time saved, team size, etc.)
- Keep it to ONE concise sentence (max 25 words)
- Maintain factual accuracy — do NOT invent metrics that weren't implied
- If the original already has metrics, preserve or improve them
- Match the professional tone of a top-tier resume
- Do NOT include bullet point symbols (•, -, *)
- Output ONLY the enhanced bullet text, nothing else`;

    const userMessage = `Enhance this resume bullet point:
"${bullet.trim()}"

Context:
- Role: ${jobTitle || "Not specified"}
- Company: ${company || "Not specified"}
${targetRole ? `- Target role they're applying for: ${targetRole}` : ""}

Return ONLY the improved bullet text.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `API error ${res.status}`);
    }

    const data = await res.json();
    const enhanced =
      data.content?.[0]?.text?.trim().replace(/^["•\-*]\s*/, "").replace(/"$/, "") || "";

    if (!enhanced) {
      throw new Error("No enhancement generated");
    }

    return new Response(JSON.stringify({ enhanced }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    if (err.name === "AbortError") {
      return new Response(
        JSON.stringify({ error: "Request timed out" }),
        { status: 504, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: err.message || "Enhancement failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config: Config = {
  path: "/api/enhance-bullet",
};
