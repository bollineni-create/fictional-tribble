/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_STRIPE_PK: string
  readonly VITE_STRIPE_PRICING_TABLE_ID: string
  readonly VITE_STRIPE_PAYMENT_LINK_PRO: string
  readonly VITE_STRIPE_PAYMENT_LINK_MAX: string
  readonly VITE_STRIPE_BUY_BUTTON_PRO_ID: string
  readonly VITE_STRIPE_BUY_BUTTON_MAX_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Stripe global type
declare const Stripe: (key: string) => any

// Stripe web component types
declare namespace JSX {
  interface IntrinsicElements {
    'stripe-pricing-table': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      'pricing-table-id'?: string
      'publishable-key'?: string
      'client-reference-id'?: string
      'customer-email'?: string
      'customer-session-client-secret'?: string
    }, HTMLElement>
    'stripe-buy-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      'buy-button-id'?: string
      'publishable-key'?: string
      'client-reference-id'?: string
      'customer-email'?: string
      'customer-session-client-secret'?: string
    }, HTMLElement>
  }
}
