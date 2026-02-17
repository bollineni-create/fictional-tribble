import type { Context, Config } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripeKey = Netlify.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const supabaseServiceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Netlify.env.get("STRIPE_WEBHOOK_SECRET");

  if (!stripeKey || !supabaseUrl || !supabaseServiceKey) {
    console.error("Missing environment variables");
    return new Response("Server configuration error", { status: 500 });
  }

  try {
    const rawBody = await req.text();

    // ---- STRIPE SIGNATURE VERIFICATION ----
    // If webhook secret is configured, verify the signature to prevent spoofed events
    if (webhookSecret) {
      const signature = req.headers.get("stripe-signature");
      if (!signature) {
        console.error("Missing stripe-signature header");
        return new Response("Missing signature", { status: 400 });
      }

      const isValid = await verifyStripeSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        console.error("Invalid Stripe webhook signature");
        return new Response("Invalid signature", { status: 400 });
      }
    } else {
      console.warn("STRIPE_WEBHOOK_SECRET not set — skipping signature verification. Set this in production!");
    }

    const event = JSON.parse(rawBody);

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

// ---- STRIPE SIGNATURE VERIFICATION ----
// Verifies webhook signatures without the Stripe SDK using Web Crypto API
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  try {
    // Parse the signature header
    const parts = sigHeader.split(",");
    let timestamp = "";
    const signatures: string[] = [];

    for (const part of parts) {
      const [key, value] = part.split("=");
      if (key === "t") timestamp = value;
      if (key === "v1") signatures.push(value);
    }

    if (!timestamp || signatures.length === 0) return false;

    // Reject if timestamp is too old (5 minutes tolerance)
    const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
    if (age > 300) {
      console.error("Webhook timestamp too old:", age, "seconds");
      return false;
    }

    // Compute expected signature: HMAC-SHA256(secret, timestamp + "." + payload)
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload)
    );

    const expectedSig = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Compare against all provided v1 signatures
    return signatures.some((sig) => timingSafeEqual(sig, expectedSig));
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

// Timing-safe string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export const config: Config = {
  path: "/api/stripe-webhook",
};
