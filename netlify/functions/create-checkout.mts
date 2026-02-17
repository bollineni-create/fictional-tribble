import type { Context, Config } from "@netlify/functions";

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
    const params = new URLSearchParams();
    params.append("mode", "subscription");
    params.append("line_items[0][price]", priceId);
    params.append("line_items[0][quantity]", "1");
    params.append("ui_mode", "embedded");
    // Pass the plan as metadata so the webhook can set the tier
    params.append("subscription_data[metadata][plan]", plan);
    const origin = new URL(req.url).origin;
    params.append("return_url", `${origin}/?session_id={CHECKOUT_SESSION_ID}`);

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
