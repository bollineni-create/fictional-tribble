import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://agvhbkrtsgqkritdzagy.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFndmhia3J0c2dxa3JpdGR6YWd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMDEwOTgsImV4cCI6MjA4Njg3NzA5OH0.aV8kD_mZMMBfK5w_vt-HvVJZgQ_jgGg_7QPNbM65Jgs'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/**
 * Timeout wrapper — prevents Supabase calls from hanging indefinitely.
 * This is critical because the Supabase JS client can hang when there
 * are stale tokens in localStorage or internal state locks.
 */
export function withTimeout<T>(promise: Promise<T>, ms = 10000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error('Request timed out. Please check your connection and try again.')),
        ms
      )
    ),
  ])
}
