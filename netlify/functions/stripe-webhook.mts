import type { Context, Config } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripeKey = Netlify.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const supabaseServiceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey || !supabaseUrl || !supabaseServiceKey) {
    console.error("Missing environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  try {
    const body = await req.json();
    const event = body;

    console.log("Stripe webhook event:", event.type);

    // Handle checkout completion
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const customerEmail = session.customer_details?.email;
      const stripeCustomerId = session.customer;
      const subscriptionId = session.subscription;

      if (customerEmail) {
        // Update profile to Pro
        const res = await fetch(
          `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(customerEmail)}`,
          {
            method: "PATCH",
            headers: {
              "apikey": supabaseServiceKey,
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
              "Prefer": "return=minimal",
            },
            body: JSON.stringify({
              is_pro: true,
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: subscriptionId,
              updated_at: new Date().toISOString(),
            }),
          }
        );
        console.log("Profile update response:", res.status);
      }
    }

    // Handle subscription cancelled
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const stripeCustomerId = subscription.customer;

      // Remove Pro status
      const res = await fetch(
        `${supabaseUrl}/rest/v1/profiles?stripe_customer_id=eq.${stripeCustomerId}`,
        {
          method: "PATCH",
          headers: {
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            is_pro: false,
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          }),
        }
      );
      console.log("Subscription cancelled, profile updated:", res.status);
    }

    // Handle payment failed
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const stripeCustomerId = invoice.customer;

      console.log("Payment failed for customer:", stripeCustomerId);
      // Optionally downgrade after repeated failures
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Webhook processing failed", { status: 500 });
  }
};

export const config: Config = {
  path: "/api/stripe-webhook",
};
