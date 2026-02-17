import type { Context, Config } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  // ---- AUTH REQUIRED ----
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const supabaseServiceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mailgunDomain = Netlify.env.get("MAILGUN_DOMAIN");

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { "Content-Type": "application/json" } });
  }

  if (!mailgunDomain) {
    return new Response(JSON.stringify({ error: "Email system not configured yet. Contact support." }),
      { status: 503, headers: { "Content-Type": "application/json" } });
  }

  try {
    const token = authHeader.replace("Bearer ", "");
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseServiceKey },
    });
    if (!userRes.ok) throw new Error("Invalid token");
    const user = await userRes.json();

    // Check if already provisioned
    const checkRes = await fetch(
      `${supabaseUrl}/rest/v1/user_emails?user_id=eq.${user.id}&select=email_address`,
      { headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` } }
    );
    const existing = await checkRes.json();
    if (existing.length > 0) {
      return new Response(
        JSON.stringify({ email: existing[0].email_address }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Generate unique email address
    const name = (user.user_metadata?.full_name || user.email?.split("@")[0] || "user")
      .toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20);
    const suffix = user.id.substring(0, 6);
    const emailAddress = `${name}.${suffix}@${mailgunDomain}`;

    // Save to Supabase
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/user_emails`, {
      method: "POST",
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: user.id,
        email_address: emailAddress,
      }),
    });

    if (!insertRes.ok) {
      const err = await insertRes.text();
      console.error("Insert email error:", err);
      throw new Error("Failed to provision email");
    }

    return new Response(
      JSON.stringify({ email: emailAddress }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Provision email error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Failed to provision email" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config: Config = {
  path: "/api/provision-email",
};
