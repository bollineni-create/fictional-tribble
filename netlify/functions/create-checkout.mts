import type { Context, Config } from "@netlify/functions";

/**
 * Create a Stripe Checkout Session
 *
 * Supports two modes:
 * - embedded (default): Returns clientSecret for Stripe.js embedded checkout
 * - hosted: Returns URL for Stripe-hosted checkout page (redirect)
 *
 * Body params:
 * - plan: "pro" | "max" (default: "pro")
 * - mode: "embedded" | "hosted" (default: "embedded")
 * - customerEmail: optional email to prefill
 */

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stripeKey = Netlify.env.get("STRIPE_SECRET_KEY");
  const proPriceId = Netlify.env.get("STRIPE_PRICE_ID");
  const maxPriceId = Netlify.env.get("STRIPE_MAX_PRICE_ID");

  if (!stripeKey || !proPriceId) {
    return new Response(
      JSON.stringify({ error: "Stripe not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Parse body for plan selection
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Default to pro if no body
  }

  const plan = body.plan || "pro";
  const uiMode = body.mode || "embedded";
  const customerEmail = body.customerEmail || "";
  let priceId: string;

  if (plan === "max" && maxPriceId) {
    priceId = maxPriceId;
  } else if (plan === "max" && !maxPriceId) {
    return new Response(
      JSON.stringify({ error: "Max plan not configured yet. Please contact support." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } else {
    priceId = proPriceId;
  }

  try {
    const origin = new URL(req.url).origin;
    const params = new URLSearchParams();
    params.append("mode", "subscription");
    params.append("line_items[0][price]", priceId);
    params.append("line_items[0][quantity]", "1");
    // Pass the plan as metadata so the webhook can set the tier
    params.append("subscription_data[metadata][plan]", plan);

    if (uiMode === "hosted") {
      // Hosted mode: Stripe-hosted checkout page with redirect
      params.append("success_url", `${origin}/?success=true&session_id={CHECKOUT_SESSION_ID}`);
      params.append("cancel_url", `${origin}/#pricing-anchor`);
      if (customerEmail) {
        params.append("customer_email", customerEmail);
      }
    } else {
      // Embedded mode: Returns client_secret for Stripe.js
      params.append("ui_mode", "embedded");
      params.append("return_url", `${origin}/?session_id={CHECKOUT_SESSION_ID}`);
    }

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Stripe API error:", errorData);
      return new Response(
        JSON.stringify({ error: "Failed to create checkout session" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const session = await response.json();

    if (uiMode === "hosted") {
      return new Response(
        JSON.stringify({ url: session.url }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ clientSecret: session.client_secret }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Checkout error:", err);
    return new Response(
      JSON.stringify({ error: "Something went wrong" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

export const config: Config = {
  path: "/api/create-checkout",
};
