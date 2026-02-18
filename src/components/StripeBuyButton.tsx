import { useEffect, useRef } from 'react'

/**
 * Stripe Buy Button — embeddable no-code component
 *
 * Uses a DOM ref to set attributes directly on the custom element,
 * because React's JSX doesn't reliably pass attributes to web components.
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
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!buyButtonId || !containerRef.current) return

    // Clear previous button if re-rendering
    containerRef.current.innerHTML = ''

    // Wait for the Stripe buy-button script to be ready
    const renderButton = () => {
      if (!containerRef.current) return

      const el = document.createElement('stripe-buy-button')
      el.setAttribute('buy-button-id', buyButtonId)
      el.setAttribute('publishable-key', publishableKey)
      if (clientReferenceId) el.setAttribute('client-reference-id', clientReferenceId)
      if (customerEmail) el.setAttribute('customer-email', customerEmail)
      if (customerSessionClientSecret) el.setAttribute('customer-session-client-secret', customerSessionClientSecret)

      containerRef.current.appendChild(el)
    }

    // Check if the script is already loaded
    if (customElements.get('stripe-buy-button')) {
      renderButton()
    } else {
      // Wait for the script to define the custom element
      const check = setInterval(() => {
        if (customElements.get('stripe-buy-button')) {
          clearInterval(check)
          renderButton()
        }
      }, 100)

      // Timeout after 10s
      const timeout = setTimeout(() => clearInterval(check), 10000)

      return () => {
        clearInterval(check)
        clearTimeout(timeout)
      }
    }
  }, [buyButtonId, publishableKey, clientReferenceId, customerEmail, customerSessionClientSecret])

  if (!buyButtonId) return null

  return <div ref={containerRef} />
}
