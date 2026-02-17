import type { Context, Config } from "@netlify/functions";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from "docx";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ---- AUTH CHECK (Pro only) ----
  const authHeader = req.headers.get("authorization");
  const isPro = await checkProStatus(authHeader);

  if (!isPro) {
    return new Response(
      JSON.stringify({ error: "DOCX export is a Pro feature. Upgrade to access it!" }),
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

  try {
    const doc = buildDocument(content, title || "Resume", type || "resume");
    const buffer = await Packer.toBuffer(doc);

    const filename = type === "coverLetter"
      ? "cover-letter.docx"
      : "resume.docx";

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("DOCX generation error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to generate document" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

function buildDocument(content: string, title: string, type: string): Document {
  const lines = content.split("\n");
  const children: Paragraph[] = [];

  // Document title
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: 32,
          font: "Calibri",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // Separator line
  children.push(
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
      },
      spacing: { after: 300 },
    })
  );

  // Parse content line by line
  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      children.push(new Paragraph({ spacing: { after: 100 } }));
      continue;
    }

    // Detect section headers (ALL CAPS lines or lines ending with colon)
    const isHeader =
      trimmed === trimmed.toUpperCase() &&
      trimmed.length > 3 &&
      trimmed.length < 60 &&
      /^[A-Z\s&/]+$/.test(trimmed);

    if (isHeader) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed,
              bold: true,
              size: 24,
              font: "Calibri",
              color: "2b5797",
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 100 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "2b5797" },
          },
        })
      );
    } else if (trimmed.startsWith("•") || trimmed.startsWith("-") || trimmed.startsWith("*")) {
      // Bullet points
      const bulletText = trimmed.replace(/^[•\-*]\s*/, "");
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: bulletText,
              size: 22,
              font: "Calibri",
            }),
          ],
          bullet: { level: 0 },
          spacing: { after: 60 },
        })
      );
    } else {
      // Regular text
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed,
              size: 22,
              font: "Calibri",
            }),
          ],
          spacing: { after: 80 },
        })
      );
    }
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children,
      },
    ],
  });
}

async function checkProStatus(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;

  try {
    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Netlify.env.get("SUPABASE_URL");
    const supabaseServiceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) return false;

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseServiceKey,
      },
    });

    if (!userRes.ok) return false;
    const user = await userRes.json();

    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=is_pro`,
      {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      }
    );

    if (!profileRes.ok) return false;
    const profiles = await profileRes.json();
    return profiles.length > 0 && profiles[0].is_pro;
  } catch {
    return false;
  }
}

export const config: Config = {
  path: "/api/export-docx",
};
