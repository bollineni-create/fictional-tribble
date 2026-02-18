import { useEffect, useRef } from 'react'

/**
 * Stripe Pricing Table — no-code embeddable component
 *
 * To set up:
 * 1. Go to Stripe Dashboard → Product Catalog → Pricing Tables
 * 2. Create a new pricing table with your Free/Pro/Max products
 * 3. Copy the pricing-table-id and publishable-key
 * 4. Set VITE_STRIPE_PRICING_TABLE_ID in your .env
 *
 * The component renders Stripe's native <stripe-pricing-table> web component
 * which handles the full checkout flow — no custom backend needed.
 */

const STRIPE_PK = import.meta.env.VITE_STRIPE_PK || 'pk_live_51T1fqEFyD3IgcpECoSOIFPs59HLLvC7udSHohLA45WWYc8TW5nSqFCTG04uORZYBlgUoF8UkobWT2KR1KBwSOYUe00maxfwAsS'
const PRICING_TABLE_ID = import.meta.env.VITE_STRIPE_PRICING_TABLE_ID || ''

interface StripePricingTableProps {
  clientReferenceId?: string
  customerEmail?: string
  customerSessionClientSecret?: string
}

export default function StripePricingTable({ clientReferenceId, customerEmail, customerSessionClientSecret }: StripePricingTableProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Load the Stripe pricing table script if not already loaded
    if (!document.querySelector('script[src="https://js.stripe.com/v3/pricing-table.js"]')) {
      const script = document.createElement('script')
      script.src = 'https://js.stripe.com/v3/pricing-table.js'
      script.async = true
      document.head.appendChild(script)
    }
  }, [])

  if (!PRICING_TABLE_ID) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '40px 20px',
        color: 'var(--text-muted)',
        background: 'var(--surface)',
        borderRadius: 16,
        border: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>&#9881;</div>
        <p style={{ fontSize: 14, marginBottom: 8 }}>
          Stripe Pricing Table not configured yet.
        </p>
        <p style={{ fontSize: 12 }}>
          Set <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>VITE_STRIPE_PRICING_TABLE_ID</code> in your environment variables.
        </p>
      </div>
    )
  }

  // Build the web component attributes
  const attrs: Record<string, string> = {
    'pricing-table-id': PRICING_TABLE_ID,
    'publishable-key': STRIPE_PK,
  }
  if (clientReferenceId) attrs['client-reference-id'] = clientReferenceId
  if (customerEmail) attrs['customer-email'] = customerEmail
  if (customerSessionClientSecret) attrs['customer-session-client-secret'] = customerSessionClientSecret

  return (
    <div ref={containerRef} style={{ width: '100%', maxWidth: 960, margin: '0 auto' }}>
      {/* @ts-ignore — Stripe web component */}
      <stripe-pricing-table {...attrs}></stripe-pricing-table>
    </div>
  )
}
