import type { Context, Config } from "@netlify/functions";

/**
 * PDF Export — generates a professional resume HTML page
 * matching Naren Bollineni's resume template format:
 *   - Times New Roman throughout
 *   - Name: 18pt centered
 *   - Contact line: 7pt centered with pipe separators
 *   - Section headers: 11pt bold uppercase with full-width underline
 *   - Company: 10pt bold left, dates 10pt italic right
 *   - Job title: 10pt italic
 *   - Bullets: 10pt regular with 18pt left indent
 *   - Line spacing: ~11pt
 *   - Margins: 0.5in all around (36pt)
 *
 * Accepts EITHER:
 *  - { content: string } — raw text to format heuristically
 *  - { structured: ResumeData } — structured JSON for precise layout
 */

interface ExperienceEntry {
  company: string;
  title: string;
  dates: string;
  bullets: string[];
}

interface EducationEntry {
  school: string;
  degree: string;
}

interface PublicationEntry {
  text: string;
}

interface SkillsGroup {
  label: string; // e.g. "Software", "Languages", "Certifications"
  value: string;
}

interface HonorsGroup {
  label: string; // e.g. "Honors", "Awards"
  value: string;
}

interface ResumeData {
  fullName: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  location?: string;
  website?: string;
  experience?: ExperienceEntry[];
  leadership?: ExperienceEntry[];
  education?: EducationEntry[];
  publications?: PublicationEntry[];
  honors?: HonorsGroup[];
  skills?: SkillsGroup[];
  customSections?: { heading: string; content: string }[];
}

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
      JSON.stringify({
        error: "PDF export requires a Pro or Max plan. Upgrade to access it!",
        tier,
      }),
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

  let html: string;

  if (body.structured) {
    // Structured resume data — precise layout
    html = generateStructuredHTML(body.structured);
  } else if (body.content) {
    // Raw text — parse heuristically
    html = generateFromText(
      body.content,
      body.title || "Resume",
      body.type || "resume"
    );
  } else {
    return new Response(
      JSON.stringify({ error: "Missing content or structured data" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ html }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

/* ================================================================
   STRUCTURED HTML GENERATOR — exact match to template
   ================================================================ */

function generateStructuredHTML(data: ResumeData): string {
  const h = escapeHtml;
  let bodyHtml = "";

  // ---- Header: Name ----
  bodyHtml += `<div class="header-name">${h(data.fullName.toUpperCase())}</div>\n`;

  // ---- Contact line ----
  const contactParts: string[] = [];
  if (data.email) contactParts.push(`<a href="mailto:${h(data.email)}" class="contact-link">${h(data.email.toUpperCase())}</a>`);
  if (data.phone) contactParts.push(h(data.phone));
  if (data.linkedin) {
    const display = data.linkedin.replace(/^https?:\/\//, "").toUpperCase();
    contactParts.push(`<a href="${h(data.linkedin.startsWith('http') ? data.linkedin : 'https://' + data.linkedin)}" class="contact-link">${h(display)}</a>`);
  }
  if (data.website) {
    const display = data.website.replace(/^https?:\/\//, "").toUpperCase();
    contactParts.push(`<a href="${h(data.website.startsWith('http') ? data.website : 'https://' + data.website)}" class="contact-link">${h(display)}</a>`);
  }
  if (data.location) contactParts.push(h(data.location.toUpperCase()));
  if (contactParts.length > 0) {
    bodyHtml += `<div class="header-contact">${contactParts.join(' <span class="pipe">|</span> ')}</div>\n`;
  }

  // ---- Professional Experience ----
  if (data.experience && data.experience.length > 0) {
    bodyHtml += sectionHeader("PROFESSIONAL EXPERIENCE");
    for (const entry of data.experience) {
      bodyHtml += experienceBlock(entry);
    }
  }

  // ---- Leadership ----
  if (data.leadership && data.leadership.length > 0) {
    bodyHtml += sectionHeader("LEADERSHIP");
    for (const entry of data.leadership) {
      bodyHtml += experienceBlock(entry);
    }
  }

  // ---- Education ----
  if (data.education && data.education.length > 0) {
    bodyHtml += sectionHeader("EDUCATION");
    for (const edu of data.education) {
      bodyHtml += `<div class="edu-school">${h(edu.school)}</div>\n`;
      bodyHtml += `<div class="edu-degree">${h(edu.degree)}</div>\n`;
    }
  }

  // ---- Publications ----
  if (data.publications && data.publications.length > 0) {
    bodyHtml += sectionHeader("PUBLICATIONS");
    for (const pub of data.publications) {
      bodyHtml += `<div class="publication">${h(pub.text)}</div>\n`;
    }
  }

  // ---- Honors & Awards ----
  if (data.honors && data.honors.length > 0) {
    bodyHtml += sectionHeader("HONORS & AWARDS");
    for (const hon of data.honors) {
      bodyHtml += `<div class="skills-line"><span class="skills-label">${h(hon.label)}:</span> ${h(hon.value)}</div>\n`;
    }
  }

  // ---- Certifications & Skills ----
  if (data.skills && data.skills.length > 0) {
    bodyHtml += sectionHeader("CERTIFICATIONS & SKILLS");
    for (const skill of data.skills) {
      bodyHtml += `<div class="skills-line"><span class="skills-label">${h(skill.label)}:</span> ${h(skill.value)}</div>\n`;
    }
  }

  // ---- Custom sections ----
  if (data.customSections) {
    for (const sec of data.customSections) {
      bodyHtml += sectionHeader(sec.heading.toUpperCase());
      bodyHtml += `<div class="custom-content">${h(sec.content)}</div>\n`;
    }
  }

  return wrapInPage(bodyHtml, data.fullName);
}

function sectionHeader(title: string): string {
  return `<div class="section-header">${escapeHtml(title)}</div>\n`;
}

function experienceBlock(entry: ExperienceEntry): string {
  const h = escapeHtml;
  let html = `<div class="entry-header">
  <span class="entry-company">${h(entry.company)}</span>
  <span class="entry-dates">${h(entry.dates)}</span>
</div>\n`;
  html += `<div class="entry-title">${h(entry.title)}</div>\n`;
  if (entry.bullets && entry.bullets.length > 0) {
    html += `<ul class="entry-bullets">\n`;
    for (const bullet of entry.bullets) {
      html += `  <li>${h(bullet)}</li>\n`;
    }
    html += `</ul>\n`;
  }
  return html;
}

/* ================================================================
   TEXT-BASED PARSER — heuristic formatting from raw text
   ================================================================ */

function generateFromText(
  content: string,
  title: string,
  type: string
): string {
  const lines = content.split("\n");
  let bodyHtml = "";
  let inBulletList = false;

  // Try to detect the name from the first non-empty line
  let nameFound = false;
  let contactFound = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      if (inBulletList) {
        bodyHtml += "</ul>\n";
        inBulletList = false;
      }
      continue;
    }

    // First non-empty line = name
    if (!nameFound) {
      bodyHtml += `<div class="header-name">${escapeHtml(trimmed.toUpperCase())}</div>\n`;
      nameFound = true;
      continue;
    }

    // Second line = contact info (if contains @ or phone-like or |)
    if (!contactFound && (trimmed.includes("@") || trimmed.includes("|") || /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(trimmed))) {
      const parts = trimmed.split(/\s*\|\s*/);
      bodyHtml += `<div class="header-contact">${parts.map((p) => escapeHtml(p.toUpperCase())).join(' <span class="pipe">|</span> ')}</div>\n`;
      contactFound = true;
      continue;
    }

    // Section headers: ALL CAPS, short, alphabetic
    const isSectionHeader =
      trimmed === trimmed.toUpperCase() &&
      trimmed.length > 3 &&
      trimmed.length < 60 &&
      /^[A-Z\s&/,]+$/.test(trimmed);

    if (isSectionHeader) {
      if (inBulletList) {
        bodyHtml += "</ul>\n";
        inBulletList = false;
      }
      bodyHtml += `<div class="section-header">${escapeHtml(trimmed)}</div>\n`;
      continue;
    }

    // Detect "Company Name   Date Range" pattern
    const datePattern = /^(.+?)\s{2,}(.+(?:\d{4}|Present).*)$/;
    const dateMatch = trimmed.match(datePattern);
    if (dateMatch && !trimmed.startsWith("•") && !trimmed.startsWith("-")) {
      if (inBulletList) {
        bodyHtml += "</ul>\n";
        inBulletList = false;
      }
      bodyHtml += `<div class="entry-header">
  <span class="entry-company">${escapeHtml(dateMatch[1].trim())}</span>
  <span class="entry-dates">${escapeHtml(dateMatch[2].trim())}</span>
</div>\n`;
      continue;
    }

    // Bullet points
    if (trimmed.startsWith("•") || trimmed.startsWith("-") || trimmed.startsWith("*")) {
      const text = trimmed.replace(/^[•\-*]\s*/, "");
      if (!inBulletList) {
        bodyHtml += '<ul class="entry-bullets">\n';
        inBulletList = true;
      }
      bodyHtml += `  <li>${escapeHtml(text)}</li>\n`;
      continue;
    }

    // Detect "Label: Value" pattern (skills, certifications)
    const labelMatch = trimmed.match(/^([A-Za-z]+):\s*(.+)$/);
    if (
      labelMatch &&
      ["Certifications", "Software", "Languages", "Honors", "Awards", "Skills", "Tools", "Interests"].includes(labelMatch[1])
    ) {
      if (inBulletList) {
        bodyHtml += "</ul>\n";
        inBulletList = false;
      }
      bodyHtml += `<div class="skills-line"><span class="skills-label">${escapeHtml(labelMatch[1])}:</span> ${escapeHtml(labelMatch[2])}</div>\n`;
      continue;
    }

    // Italic title line (if previous was entry-header, this is likely the job title)
    // Heuristic: short-ish line that doesn't start with bullet and follows a header
    if (inBulletList) {
      bodyHtml += "</ul>\n";
      inBulletList = false;
    }

    // Check if it looks like a job title (titlecase, no bullet, not too long)
    if (
      trimmed.length < 80 &&
      !trimmed.startsWith("•") &&
      /^[A-Z]/.test(trimmed) &&
      !/\d{4}/.test(trimmed) &&
      bodyHtml.includes("entry-header") &&
      !bodyHtml.endsWith("entry-title\">")
    ) {
      // Likely a job title or role
      bodyHtml += `<div class="entry-title">${escapeHtml(trimmed)}</div>\n`;
    } else {
      bodyHtml += `<p class="body-text">${escapeHtml(trimmed)}</p>\n`;
    }
  }

  if (inBulletList) bodyHtml += "</ul>\n";

  return wrapInPage(bodyHtml, title);
}

/* ================================================================
   HTML PAGE WRAPPER — CSS that matches the resume template exactly
   ================================================================ */

function wrapInPage(bodyHtml: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${escapeHtml(title)} — Resume</title>
<style>
  /* === RESET === */
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  /* === PAGE SETUP === */
  @page {
    size: letter;
    margin: 0.5in;
  }

  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 10pt;
    line-height: 1.15;
    color: #000;
    max-width: 8.5in;
    margin: 0 auto;
    padding: 0.5in;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  a { color: #000; text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* === HEADER === */
  .header-name {
    font-family: 'Times New Roman', Times, serif;
    font-size: 18pt;
    font-weight: normal;
    text-align: center;
    letter-spacing: 1pt;
    margin-bottom: 2pt;
  }

  .header-contact {
    font-family: 'Times New Roman', Times, serif;
    font-size: 7pt;
    text-align: center;
    margin-bottom: 10pt;
    letter-spacing: 0.3pt;
  }

  .header-contact .pipe {
    font-family: Cambria, 'Times New Roman', serif;
    font-size: 6pt;
    margin: 0 4pt;
  }

  .contact-link {
    color: #000;
    text-decoration: none;
  }

  /* === SECTION HEADERS === */
  .section-header {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    font-weight: bold;
    text-transform: uppercase;
    border-bottom: 1px solid #000;
    padding-bottom: 1pt;
    margin-top: 10pt;
    margin-bottom: 2pt;
  }

  /* === EXPERIENCE ENTRIES === */
  .entry-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-top: 1pt;
  }

  .entry-company {
    font-weight: bold;
    font-size: 10pt;
  }

  .entry-dates {
    font-style: italic;
    font-size: 10pt;
    white-space: nowrap;
    text-align: right;
  }

  .entry-title {
    font-style: italic;
    font-size: 10pt;
    margin-bottom: 1pt;
  }

  .entry-bullets {
    list-style: disc;
    margin-left: 18pt;
    padding-left: 0;
    margin-bottom: 1pt;
  }

  .entry-bullets li {
    font-size: 10pt;
    line-height: 1.15;
    margin-bottom: 0;
    padding-left: 0;
  }

  .entry-bullets li::marker {
    font-size: 8pt;
  }

  /* === EDUCATION === */
  .edu-school {
    font-weight: bold;
    font-size: 10pt;
    margin-top: 1pt;
  }

  .edu-degree {
    font-size: 10pt;
    margin-bottom: 2pt;
  }

  /* === PUBLICATIONS === */
  .publication {
    font-size: 10pt;
    text-indent: 36pt;
    margin-bottom: 4pt;
    line-height: 1.15;
  }

  /* === SKILLS / HONORS === */
  .skills-line {
    font-size: 10pt;
    line-height: 1.15;
    margin-bottom: 0;
  }

  .skills-label {
    font-weight: bold;
  }

  /* === BODY TEXT === */
  .body-text {
    font-size: 10pt;
    line-height: 1.15;
    margin-bottom: 1pt;
  }

  .custom-content {
    font-size: 10pt;
    line-height: 1.15;
    white-space: pre-wrap;
  }

  /* === PRINT === */
  @media print {
    body {
      padding: 0;
      max-width: none;
    }
    a { color: #000 !important; }
  }
</style>
</head>
<body>
${bodyHtml}
<script>window.onload=function(){window.print();}</script>
</body>
</html>`;
}

/* ================================================================
   UTILITIES
   ================================================================ */

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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseServiceKey,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!userRes.ok) return "free";
    const user = await userRes.json();

    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=is_pro,tier`,
      {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      }
    );
    if (!profileRes.ok) return "free";
    const profiles = await profileRes.json();
    if (profiles.length === 0) return "free";
    const p = profiles[0];
    if (p.tier) return p.tier;
    return p.is_pro ? "pro" : "free";
  } catch {
    return "free";
  }
}

export const config: Config = {
  path: "/api/export-pdf",
};
