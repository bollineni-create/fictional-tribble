import type { Context, Config } from "@netlify/functions";

// Mailgun sends inbound emails as multipart/form-data POST
export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const supabaseServiceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response("Server error", { status: 500 });
  }

  try {
    // Mailgun sends form-encoded data
    const formData = await req.formData();
    const from = formData.get("from")?.toString() || "";
    const to = formData.get("recipient")?.toString() || formData.get("To")?.toString() || "";
    const subject = formData.get("subject")?.toString() || "(no subject)";
    const bodyText = formData.get("body-plain")?.toString() || "";
    const bodyHtml = formData.get("body-html")?.toString() || "";

    if (!to) {
      return new Response("Missing recipient", { status: 400 });
    }

    // Look up which user this email belongs to
    const lookupRes = await fetch(
      `${supabaseUrl}/rest/v1/user_emails?email_address=eq.${encodeURIComponent(to)}&select=user_id`,
      { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }
    );
    const users = await lookupRes.json();

    if (!users || users.length === 0) {
      console.log("No user found for email:", to);
      return new Response("OK", { status: 200 }); // Accept but discard
    }

    const userId = users[0].user_id;

    // Try to auto-link to an application based on sender domain
    let applicationId = null;
    const senderDomain = from.match(/@([a-zA-Z0-9.-]+)/)?.[1]?.toLowerCase();
    if (senderDomain) {
      const appRes = await fetch(
        `${supabaseUrl}/rest/v1/applications?user_id=eq.${userId}&company=ilike.*${senderDomain.split(".")[0]}*&select=id&limit=1`,
        { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }
      );
      const apps = await appRes.json();
      if (apps && apps.length > 0) {
        applicationId = apps[0].id;
      }
    }

    // Store the message
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/messages`, {
      method: "POST",
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        direction: "inbound",
        from_address: from,
        to_address: to,
        subject,
        body_text: bodyText.substring(0, 50000),
        body_html: bodyHtml.substring(0, 100000),
        is_read: false,
        application_id: applicationId,
      }),
    });

    if (!insertRes.ok) {
      console.error("Failed to store email:", await insertRes.text());
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Email webhook error:", err);
    return new Response("Error", { status: 500 });
  }
};

export const config: Config = {
  path: "/api/email-webhook",
};
