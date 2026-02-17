import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, withTimeout } from '../lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

type Tier = 'free' | 'pro' | 'max'

interface Profile {
  id: string
  email: string
  full_name?: string
  is_pro: boolean
  tier?: Tier
  stripe_customer_id?: string
  stripe_subscription_id?: string
  pro_expires_at?: string
  created_at: string
  updated_at: string
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ error?: string }>
  signup: (name: string, email: string, password: string) => Promise<{ error?: string; needsConfirmation?: boolean }>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
  isPro: boolean
  isMax: boolean
  tier: Tier
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (userId: string) => {
    try {
      const result = await withTimeout(
        Promise.resolve(supabase.from('profiles').select('*').eq('id', userId).single()),
        8000
      )
      setProfile((result.data as Profile) ?? null)
    } catch (err) {
      console.error('loadProfile error:', err)
    }
  }

  const refreshProfile = async () => {
    if (user) await loadProfile(user.id)
  }

  useEffect(() => {
    // Initial session check
    const init = async () => {
      try {
        const { data: { session: s } } = await withTimeout(supabase.auth.getSession(), 8000)
        setSession(s)
        if (s?.user) {
          setUser(s.user)
          await loadProfile(s.user.id)
        }
      } catch (err) {
        console.error('Auth init error:', err)
      } finally {
        setLoading(false)
      }
    }
    init()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN' && s?.user) {
        setUser(s.user)
        await loadProfile(s.user.id)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = async (email: string, password: string) => {
    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password })
      )
      if (error) return { error: error.message }
      return {}
    } catch (err: any) {
      return { error: err.message || 'Something went wrong. Please try again.' }
    }
  }

  const signup = async (name: string, email: string, password: string) => {
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        })
      )
      if (error) return { error: error.message }

      if (data.session) {
        // Immediately signed in — wait for DB trigger to create profile
        await new Promise((r) => setTimeout(r, 1500))
        return {}
      } else if (data.user && !data.session) {
        return { needsConfirmation: true }
      }
      return { error: 'Something went wrong. Please try again.' }
    } catch (err: any) {
      return { error: err.message || 'Something went wrong. Please try again.' }
    }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setProfile(null)
  }

  const tier: Tier = profile?.tier || (profile?.is_pro ? 'pro' : 'free')
  const isPro = tier === 'pro' || tier === 'max'
  const isMax = tier === 'max'

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        login,
        signup,
        logout,
        refreshProfile,
        isPro,
        isMax,
        tier,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
