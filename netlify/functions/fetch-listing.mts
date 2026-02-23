import type { Context, Config } from "@netlify/functions";

/**
 * Fetch a job listing from a URL — extracts the main text content
 * and uses Claude to pull out just the job description.
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
    return new Response(JSON.stringify({ error: "API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch the page
    const pageRes = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!pageRes.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch page (${pageRes.status})` }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const html = await pageRes.text();

    // Strip HTML to plain text — remove scripts, styles, then tags
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    // Truncate to keep within token limits
    if (text.length > 12000) {
      text = text.slice(0, 12000);
    }

    if (text.length < 50) {
      return new Response(
        JSON.stringify({
          error: "Could not extract text from this page. Try pasting the description manually.",
        }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      );
    }

    // Use Claude to extract just the job description
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `Extract ONLY the job listing from this webpage text. Include: job title, company, location, requirements, responsibilities, qualifications, and any other job-specific details. Remove navigation, ads, footers, and unrelated content. Return the clean job description as plain text, preserving the structure with line breaks.\n\nWebpage text:\n${text}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!aiRes.ok) {
      // Fallback: return raw extracted text
      return new Response(
        JSON.stringify({ description: text.slice(0, 5000), title: "" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiRes.json();
    const extracted =
      aiData.content?.[0]?.text || text.slice(0, 5000);

    // Try to extract job title from the first line
    const firstLine = extracted.split("\n")[0].trim();
    const title =
      firstLine.length < 80 && !firstLine.includes(".")
        ? firstLine
        : "";

    return new Response(
      JSON.stringify({ description: extracted, title }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("fetch-listing error:", err);
    return new Response(
      JSON.stringify({
        error:
          err.name === "TimeoutError"
            ? "Request timed out. Try pasting the description manually."
            : "Failed to fetch listing",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config: Config = {
  path: "/api/fetch-listing",
};
