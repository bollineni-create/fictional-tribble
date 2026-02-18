import { useEffect } from 'react'

/**
 * Stripe Buy Button — embeddable no-code component
 *
 * To set up:
 * 1. Go to Stripe Dashboard → Payment Links
 * 2. Create payment links for Pro and Max plans
 * 3. Click "Buy button" on each link to get the buy-button-id
 * 4. Set VITE_STRIPE_BUY_BUTTON_PRO_ID and VITE_STRIPE_BUY_BUTTON_MAX_ID
 *
 * Each Buy Button renders a Stripe-hosted button that opens checkout.
 */

const STRIPE_PK = import.meta.env.VITE_STRIPE_PK || 'pk_live_51T1fqEFyD3IgcpECoSOIFPs59HLLvC7udSHohLA45WWYc8TW5nSqFCTG04uORZYBlgUoF8UkobWT2KR1KBwSOYUe00maxfwAsS'

interface StripeBuyButtonProps {
  buyButtonId: string
  publishableKey?: string
  clientReferenceId?: string
  customerEmail?: string
  customerSessionClientSecret?: string
}

export default function StripeBuyButton({
  buyButtonId,
  publishableKey = STRIPE_PK,
  clientReferenceId,
  customerEmail,
  customerSessionClientSecret,
}: StripeBuyButtonProps) {
  useEffect(() => {
    // Load the Stripe buy button script if not already loaded
    if (!document.querySelector('script[src="https://js.stripe.com/v3/buy-button.js"]')) {
      const script = document.createElement('script')
      script.src = 'https://js.stripe.com/v3/buy-button.js'
      script.async = true
      document.head.appendChild(script)
    }
  }, [])

  if (!buyButtonId) return null

  const attrs: Record<string, string> = {
    'buy-button-id': buyButtonId,
    'publishable-key': publishableKey,
  }
  if (clientReferenceId) attrs['client-reference-id'] = clientReferenceId
  if (customerEmail) attrs['customer-email'] = customerEmail
  if (customerSessionClientSecret) attrs['customer-session-client-secret'] = customerSessionClientSecret

  return (
    // @ts-ignore — Stripe web component
    <stripe-buy-button {...attrs}></stripe-buy-button>
  )
}
