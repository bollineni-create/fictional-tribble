import type { Context, Config } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const supabaseServiceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mailgunApiKey = Netlify.env.get("MAILGUN_API_KEY");
  const mailgunDomain = Netlify.env.get("MAILGUN_DOMAIN");

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { "Content-Type": "application/json" } });
  }

  if (!mailgunApiKey || !mailgunDomain) {
    return new Response(JSON.stringify({ error: "Email system not configured. Set MAILGUN_API_KEY and MAILGUN_DOMAIN." }),
      { status: 503, headers: { "Content-Type": "application/json" } });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const { to, subject, body: emailBody, replyToMessageId } = body;
  if (!to || !subject || !emailBody) {
    return new Response(JSON.stringify({ error: "Missing to, subject, or body" }),
      { status: 400, headers: { "Content-Type": "application/json" } });
  }

  try {
    // Get user
    const token = authHeader.replace("Bearer ", "");
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseServiceKey },
    });
    if (!userRes.ok) throw new Error("Invalid token");
    const user = await userRes.json();

    // Get user's dedicated email
    const emailRes = await fetch(
      `${supabaseUrl}/rest/v1/user_emails?user_id=eq.${user.id}&select=email_address`,
      { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }
    );
    const emails = await emailRes.json();
    if (!emails || emails.length === 0) {
      return new Response(JSON.stringify({ error: "No email address provisioned. Please set up your inbox first." }),
        { status: 400, headers: { "Content-Type": "application/json" } });
    }
    const fromEmail = emails[0].email_address;
    const userName = user.user_metadata?.full_name || fromEmail.split("@")[0];

    // Send via Mailgun
    const formData = new URLSearchParams();
    formData.append("from", `${userName} <${fromEmail}>`);
    formData.append("to", to);
    formData.append("subject", subject);
    formData.append("text", emailBody);

    const mgRes = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`api:${mailgunApiKey}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!mgRes.ok) {
      const errText = await mgRes.text();
      console.error("Mailgun send error:", errText);
      throw new Error("Failed to send email");
    }

    // Store outbound copy
    let applicationId = null;
    if (replyToMessageId) {
      // Get the application_id from the original message
      const origRes = await fetch(
        `${supabaseUrl}/rest/v1/messages?id=eq.${replyToMessageId}&select=application_id`,
        { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }
      );
      const orig = await origRes.json();
      if (orig?.[0]?.application_id) applicationId = orig[0].application_id;
    }

    await fetch(`${supabaseUrl}/rest/v1/messages`, {
      method: "POST",
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: user.id,
        direction: "outbound",
        from_address: fromEmail,
        to_address: to,
        subject,
        body_text: emailBody,
        is_read: true,
        application_id: applicationId,
      }),
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Send email error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Failed to send email" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config: Config = {
  path: "/api/send-email",
};
