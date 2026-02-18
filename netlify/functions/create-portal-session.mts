import type { Context, Config } from "@netlify/functions";

/**
 * Create a Stripe Customer Portal session
 *
 * Lets users manage their subscription, update payment methods,
 * view invoices, and cancel — all via Stripe's hosted portal.
 *
 * Setup:
 * 1. Go to Stripe Dashboard → Settings → Billing → Customer portal
 * 2. Configure allowed actions (cancel, update payment, etc.)
 * 3. Activate the portal link
 */

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stripeKey = Netlify.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response(
      JSON.stringify({ error: "Stripe not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Authenticate user
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const supabaseServiceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!token || !supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Get user from Supabase
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseServiceKey },
    });
    if (!userRes.ok) {
      return new Response(
        JSON.stringify({ error: "Invalid session" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    const user = await userRes.json();

    // Get Stripe customer ID from profile
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=stripe_customer_id`,
      {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      }
    );

    if (!profileRes.ok) {
      return new Response(
        JSON.stringify({ error: "Could not load profile" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const profiles = await profileRes.json();
    if (!profiles.length || !profiles[0].stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: "No billing account found. Please subscribe first." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const customerId = profiles[0].stripe_customer_id;
    const origin = new URL(req.url).origin;

    // Create Stripe billing portal session
    const params = new URLSearchParams();
    params.append("customer", customerId);
    params.append("return_url", `${origin}/preferences`);

    const portalRes = await fetch(
      "https://api.stripe.com/v1/billing_portal/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    if (!portalRes.ok) {
      const errText = await portalRes.text();
      console.error("Stripe portal error:", errText);
      return new Response(
        JSON.stringify({ error: "Failed to create portal session" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const portalSession = await portalRes.json();

    return new Response(
      JSON.stringify({ url: portalSession.url }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Portal session error:", err);
    return new Response(
      JSON.stringify({ error: "Something went wrong" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config: Config = {
  path: "/api/create-portal-session",
};
