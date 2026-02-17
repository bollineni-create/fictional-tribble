/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_STRIPE_PK: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Stripe global type
declare const Stripe: (key: string) => any
