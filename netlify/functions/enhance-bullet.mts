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

  const { bullet, jobTitle, company, targetRole, allBullets } = body;
  if (!bullet || typeof bullet !== "string" || bullet.trim().length < 3) {
    return new Response(
      JSON.stringify({ error: "Bullet text is required (min 3 chars)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const systemPrompt = `You are a world-class resume writer who has helped thousands of professionals land roles at top companies. Your specialty is transforming vague, passive, or weak resume bullet points into powerful, results-driven achievements.

Your enhancement process:
1. IDENTIFY the core accomplishment — what did they actually do and what was the impact?
2. LEAD with a compelling past-tense action verb. Avoid overused verbs like "Managed", "Helped", "Worked on", "Responsible for". Instead use vivid verbs like: Spearheaded, Architected, Accelerated, Orchestrated, Championed, Pioneered, Transformed, Revitalized, Negotiated, Drove, Optimized, Launched, Scaled, Delivered, Reduced.
3. QUANTIFY impact wherever the original implies it — add realistic metrics (%, $, time, volume, team size). If the original says "improved performance", infer a reasonable metric like "by 35%". If the original has zero implied metrics, add scope instead (e.g. "across 12 departments", "serving 50K+ users").
4. SHOW BUSINESS VALUE — connect the action to a business outcome: revenue, cost savings, efficiency, customer satisfaction, growth, risk reduction.
5. USE the XYZ formula: "Accomplished [X] as measured by [Y], by doing [Z]"

Rules:
- ONE sentence, 15-30 words (concise but substantive)
- Past tense action verbs only (Developed, not Develop)
- NEVER fabricate specific dollar amounts or exact percentages unless the original contains them — use ranges or approximate language ("~30%", "6-figure", "significant") when inferring
- If the input is very short or vague (e.g. "data analysis"), expand it into a plausible full achievement based on the role context
- Preserve any specific metrics, tools, or technologies from the original
- Do NOT include bullet symbols (•, -, *)
- Do NOT include quotes around the output
- Output ONLY the enhanced bullet, nothing else — no explanations or alternatives`;

    const userMessage = `Transform this resume bullet point into a powerful, results-driven achievement:

ORIGINAL: "${bullet.trim()}"

CONTEXT:
- Their role: ${jobTitle || "Not specified"}
- Company: ${company || "Not specified"}
${targetRole ? `- They're targeting: ${targetRole}` : ""}
${allBullets?.length ? `- Other bullets for this role (for variety): ${allBullets.filter((b: string) => b && b !== bullet.trim()).join(" | ")}` : ""}

Enhanced bullet:`;

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
        max_tokens: 300,
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
