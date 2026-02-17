import type { Context, Config } from "@netlify/functions";

/**
 * PDF Export — generates a PDF from resume/cover letter content.
 * Uses a simple HTML-to-PDF approach via the built-in Response API
 * and a lightweight HTML template that prints cleanly to PDF.
 *
 * Note: For full server-side PDF generation, we'd need puppeteer + Chromium layer.
 * This function returns an HTML page optimized for PDF printing that the client
 * can use with window.print() or a service like html2pdf.js.
 */
export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ---- AUTH CHECK (Pro+ only) ----
  const authHeader = req.headers.get("authorization");
  const tier = await checkTier(authHeader);

  if (tier === "free") {
    return new Response(
      JSON.stringify({ error: "PDF export requires a Pro or Max plan. Upgrade to access it!", tier }),
      { status: 403, headers: { "Content-Type": "application/json" } }
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

  const { content, title, type } = body;
  if (!content) {
    return new Response(
      JSON.stringify({ error: "Missing content" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const html = generatePrintableHTML(content, title || "Resume", type || "resume");

  return new Response(
    JSON.stringify({ html }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};

function generatePrintableHTML(content: string, title: string, type: string): string {
  const lines = content.split("\n");
  let bodyHtml = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      bodyHtml += "<br/>";
      continue;
    }

    const isHeader =
      trimmed === trimmed.toUpperCase() &&
      trimmed.length > 3 &&
      trimmed.length < 60 &&
      /^[A-Z\s&/]+$/.test(trimmed);

    if (isHeader) {
      bodyHtml += `<h2 class="section-header">${escapeHtml(trimmed)}</h2>`;
    } else if (trimmed.startsWith("•") || trimmed.startsWith("-") || trimmed.startsWith("*")) {
      const text = trimmed.replace(/^[•\-*]\s*/, "");
      bodyHtml += `<li>${escapeHtml(text)}</li>`;
    } else {
      bodyHtml += `<p>${escapeHtml(trimmed)}</p>`;
    }
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>${escapeHtml(title)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #1a1a1a;
    max-width: 8.5in;
    margin: 0 auto;
    padding: 0.5in 0.6in;
  }
  h1 { font-size: 20pt; text-align: center; margin-bottom: 4px; color: #1a1a1a; }
  .subtitle { text-align: center; color: #666; font-size: 10pt; margin-bottom: 16px; }
  hr { border: none; border-top: 1.5px solid #2b5797; margin: 8px 0 16px; }
  h2.section-header {
    font-size: 12pt; font-weight: 700; color: #2b5797;
    text-transform: uppercase; letter-spacing: 0.5px;
    border-bottom: 1px solid #2b5797; padding-bottom: 2px;
    margin: 16px 0 8px;
  }
  p { margin: 4px 0; }
  li { margin-left: 20px; margin-bottom: 2px; }
  @media print {
    body { padding: 0; }
    @page { margin: 0.5in; }
  }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<hr/>
${bodyHtml}
<script>window.onload=()=>window.print();</script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function checkTier(authHeader: string | null): Promise<string> {
  if (!authHeader) return "free";
  try {
    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Netlify.env.get("SUPABASE_URL");
    const supabaseServiceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) return "free";
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseServiceKey },
    });
    if (!userRes.ok) return "free";
    const user = await userRes.json();
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=is_pro,tier`,
      { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }
    );
    if (!profileRes.ok) return "free";
    const profiles = await profileRes.json();
    if (profiles.length === 0) return "free";
    const p = profiles[0];
    if (p.tier) return p.tier;
    return p.is_pro ? "pro" : "free";
  } catch { return "free"; }
}

export const config: Config = {
  path: "/api/export-pdf",
};
