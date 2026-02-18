import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, withTimeout } from '../lib/supabase'
import Navbar from '../components/Navbar'

interface AppStats {
  totalApps: number
  applied: number
  interviewing: number
  offers: number
  rejected: number
  savedJobs: number
  unreadMessages: number
  resumeCount: number
}

interface RecentApp {
  id: string
  job_title: string
  company: string
  status: string
  created_at: string
}

interface SavedJob {
  job_id: string
  title: string
  company: string
  company_logo: string | null
  status: string
  saved_at: string
}

// Profile completion checks
const PROFILE_STEPS = [
  { key: 'name', label: 'Full name', check: (p: any) => !!p?.full_name },
  { key: 'resume', label: 'Upload a resume', check: (_p: any, s: AppStats) => s.resumeCount > 0 },
  { key: 'skills', label: 'Add skills', check: (_p: any, _s: AppStats, ext: any) => ext?.skills?.length > 0 },
  { key: 'preferences', label: 'Set job preferences', check: (_p: any, _s: AppStats, _ext: any, prefs: any) => !!prefs },
  { key: 'search', label: 'Run a job search', check: (_p: any, s: AppStats) => s.totalApps > 0 || s.savedJobs > 0 },
]

export default function Dashboard() {
  const { user, profile, isPro, isMax, tier } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<AppStats>({
    totalApps: 0, applied: 0, interviewing: 0, offers: 0, rejected: 0,
    savedJobs: 0, unreadMessages: 0, resumeCount: 0,
  })
  const [recentApps, setRecentApps] = useState<RecentApp[]>([])
  const [recentSaved, setRecentSaved] = useState<SavedJob[]>([])
  const [extProfile, setExtProfile] = useState<any>(null)
  const [hasPreferences, setHasPreferences] = useState(false)
  const [currentTime, setCurrentTime] = useState('')

  useEffect(() => {
    if (!user) { navigate('/'); return }
    loadDashboard()
    // Set greeting time
    const h = new Date().getHours()
    setCurrentTime(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')
  }, [user])

  const loadDashboard = async () => {
    if (!user) return
    setLoading(true)

    try {
      const [appsRes, savedRes, messagesRes, resumesRes, extRes, prefsRes] = await Promise.all([
        withTimeout(Promise.resolve(supabase.from('applications').select('id,job_title,company,status,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)), 8000),
        withTimeout(Promise.resolve(supabase.from('saved_jobs').select('job_id,title,company,company_logo,status,saved_at').eq('user_id', user.id).order('saved_at', { ascending: false }).limit(10)), 8000),
        isPro ? withTimeout(Promise.resolve(supabase.from('messages').select('id', { count: 'exact' }).eq('user_id', user.id).eq('is_read', false)), 8000) : Promise.resolve({ count: 0 }),
        withTimeout(Promise.resolve(supabase.from('saved_resumes').select('id', { count: 'exact' }).eq('user_id', user.id)), 8000),
        withTimeout(Promise.resolve(supabase.from('user_profiles_extended').select('skills,preferences,location').eq('user_id', user.id).single()), 8000).catch(() => ({ data: null })),
        withTimeout(Promise.resolve(supabase.from('job_preferences').select('user_id').eq('user_id', user.id).single()), 8000).catch(() => ({ data: null })),
      ])

      const apps = (appsRes as any).data || []
      const saved = (savedRes as any).data || []

      setStats({
        totalApps: apps.length,
        applied: apps.filter((a: any) => a.status === 'applied').length,
        interviewing: apps.filter((a: any) => a.status === 'interviewing').length,
        offers: apps.filter((a: any) => a.status === 'offer').length,
        rejected: apps.filter((a: any) => a.status === 'rejected').length,
        savedJobs: saved.length,
        unreadMessages: (messagesRes as any).count || 0,
        resumeCount: (resumesRes as any).count || 0,
      })

      setRecentApps(apps.slice(0, 5))
      setRecentSaved(saved.slice(0, 5))
      setExtProfile((extRes as any).data || null)
      setHasPreferences(!!(prefsRes as any).data)
    } catch (err) {
      console.error('Dashboard load error', err)
    } finally {
      setLoading(false)
    }
  }

  // Profile completion
  const completedSteps = PROFILE_STEPS.filter(s => s.check(profile, stats, extProfile, hasPreferences)).length
  const completionPct = Math.round((completedSteps / PROFILE_STEPS.length) * 100)

  const firstName = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'

  const statusColor = (status: string) => {
    switch (status) {
      case 'applied': return 'var(--accent)'
      case 'interviewing': return '#6bb5e0'
      case 'offer': return 'var(--green)'
      case 'rejected': return 'var(--error)'
      default: return 'var(--text-muted)'
    }
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case 'saved': return 'Saved'
      case 'applied': return 'Applied'
      case 'interviewing': return 'Interview'
      case 'offer': return 'Offer'
      case 'rejected': return 'Rejected'
      default: return status
    }
  }

  const timeSince = (dateStr: string) => {
    if (!dateStr) return ''
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
    return new Date(dateStr).toLocaleDateString()
  }

  if (!user) return null

  const QUICK_ACTIONS = [
    { icon: '\u26A1', label: 'Build Resume', desc: 'Upload or create', route: '/app', color: 'var(--accent)' },
    { icon: '\uD83D\uDD0D', label: 'Search Jobs', desc: 'Find opportunities', route: '/jobs', color: '#6bb5e0' },
    { icon: '\uD83D\uDD27', label: 'Tailor Resume', desc: 'Match to a listing', route: '/onboard', color: '#b088d4' },
    { icon: '\uD83C\uDF93', label: 'Interview Prep', desc: 'Practice & prepare', route: '/interview', color: '#5cb85c' },
    { icon: '\uD83D\uDCEC', label: 'Career Inbox', desc: isPro ? 'Check messages' : 'Pro feature', route: '/inbox', color: '#e8a44e', locked: !isPro },
    { icon: '\uD83D\uDD14', label: 'Job Alerts', desc: isPro ? 'Set preferences' : 'Pro feature', route: '/preferences', color: '#e06b8a', locked: !isPro },
  ]

  return (
    <div className="container">
      <Navbar />

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 20px', animation: 'fadeIn 0.4s ease-out' }}>

        {/* Greeting */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
            <h1 style={{
              fontFamily: 'var(--display)', fontSize: 28, fontWeight: 700,
              color: 'var(--white)', margin: 0, lineHeight: 1.3,
            }}>
              {currentTime}, {firstName}
            </h1>
            {tier !== 'free' && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                letterSpacing: 0.8,
                background: isMax ? 'var(--accent)' : 'rgba(201,169,110,0.15)',
                color: isMax ? '#000' : 'var(--accent)',
                border: isMax ? 'none' : '1px solid rgba(201,169,110,0.4)',
              }}>
                {isMax ? 'MAX' : 'PRO'}
              </span>
            )}
          </div>
          <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Here's where your career journey stands.
          </p>
        </div>

        {/* Profile Completion */}
        {completionPct < 100 && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '20px 24px', marginBottom: 28,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)' }}>
                Profile completion
              </span>
              <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
                {completionPct}%
              </span>
            </div>
            {/* Progress bar */}
            <div style={{
              height: 6, background: 'var(--border)', borderRadius: 3,
              overflow: 'hidden', marginBottom: 14,
            }}>
              <div style={{
                height: '100%', width: `${completionPct}%`,
                background: 'linear-gradient(90deg, var(--accent), var(--accent-dark))',
                borderRadius: 3, transition: 'width 0.6s ease',
              }} />
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {PROFILE_STEPS.map(step => {
                const done = step.check(profile, stats, extProfile, hasPreferences)
                return (
                  <span key={step.key} style={{
                    fontSize: 13, color: done ? 'var(--green)' : 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <span style={{ fontSize: 11 }}>{done ? '\u2713' : '\u25CB'}</span>
                    {step.label}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Pipeline Stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
          marginBottom: 28,
        }}>
          {[
            { label: 'Applied', value: stats.applied, color: 'var(--accent)', icon: '\uD83D\uDCE8' },
            { label: 'Interviews', value: stats.interviewing, color: '#6bb5e0', icon: '\uD83C\uDF99\uFE0F' },
            { label: 'Offers', value: stats.offers, color: 'var(--green)', icon: '\uD83C\uDF89' },
            { label: 'Saved Jobs', value: stats.savedJobs, color: '#e8a44e', icon: '\u2B50' },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '20px 18px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
              <div style={{
                fontFamily: 'var(--display)', fontSize: 28, fontWeight: 700,
                color: s.color, lineHeight: 1,
              }}>
                {loading ? '—' : s.value}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, fontWeight: 500 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div style={{ marginBottom: 28 }}>
          <h3 style={{
            fontSize: 16, fontWeight: 600, color: 'var(--white)',
            marginBottom: 14, fontFamily: 'var(--display)',
          }}>
            Quick Actions
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {QUICK_ACTIONS.map(a => (
              <button
                key={a.label}
                onClick={() => !a.locked && navigate(a.route)}
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '16px 14px', cursor: a.locked ? 'default' : 'pointer',
                  textAlign: 'left', fontFamily: 'var(--font)', transition: 'all 0.2s',
                  opacity: a.locked ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
                onMouseEnter={e => { if (!a.locked) { (e.currentTarget as HTMLElement).style.borderColor = a.color; (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)' } }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: `${a.color}15`, border: `1px solid ${a.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20,
                }}>
                  {a.icon}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)', marginBottom: 2 }}>
                    {a.label}
                    {a.locked && <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 6 }}>PRO</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Two-column: Recent Applications + Saved Jobs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>

          {/* Recent Applications */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '20px 22px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--white)', margin: 0 }}>
                Recent Applications
              </h3>
              <Link to="/tracker" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
                View all &rarr;
              </Link>
            </div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Loading...</div>
            ) : recentApps.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>{'\uD83D\uDCCB'}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>No applications yet</div>
                <Link to="/jobs" style={{
                  fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600,
                }}>
                  Search for jobs &rarr;
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentApps.map(app => (
                  <div key={app.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)',
                    border: '1px solid transparent',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 600, color: 'var(--white)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {app.job_title}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{app.company}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                        background: `${statusColor(app.status)}18`,
                        color: statusColor(app.status),
                      }}>
                        {statusLabel(app.status)}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {timeSince(app.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Saved Jobs */}
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '20px 22px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--white)', margin: 0 }}>
                Saved Jobs
              </h3>
              <Link to="/jobs" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
                Search jobs &rarr;
              </Link>
            </div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Loading...</div>
            ) : recentSaved.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}>{'\u2B50'}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>No saved jobs yet</div>
                <Link to="/jobs" style={{
                  fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600,
                }}>
                  Browse jobs &rarr;
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentSaved.map(job => (
                  <div key={job.job_id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)',
                  }}>
                    {job.company_logo ? (
                      <img
                        src={job.company_logo} alt=""
                        style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain', background: '#fff', padding: 1, flexShrink: 0 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div style={{
                        width: 28, height: 28, borderRadius: 6, background: 'var(--accent-glow)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, color: 'var(--accent)', fontWeight: 700, flexShrink: 0,
                      }}>
                        {job.company?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 600, color: 'var(--white)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {job.title}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{job.company}</div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                      {timeSince(job.saved_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Inbox / Unread (Pro only) */}
        {isPro && stats.unreadMessages > 0 && (
          <div
            onClick={() => navigate('/inbox')}
            style={{
              background: 'linear-gradient(135deg, rgba(201,169,110,0.08), rgba(201,169,110,0.03))',
              border: '1px solid rgba(201,169,110,0.25)', borderRadius: 14,
              padding: '16px 22px', marginBottom: 28, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 14, transition: 'all 0.2s',
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 10, background: 'var(--accent-glow)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
              border: '1px solid rgba(201,169,110,0.3)',
            }}>
              {'\uD83D\uDCEC'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)' }}>
                {stats.unreadMessages} unread message{stats.unreadMessages !== 1 ? 's' : ''} in your inbox
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Check recruiter replies and interview invites</div>
            </div>
            <span style={{ fontSize: 13, color: 'var(--accent)' }}>&rarr;</span>
          </div>
        )}

        {/* Upgrade CTA for free users */}
        {tier === 'free' && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(201,169,110,0.1), rgba(201,169,110,0.03))',
            border: '1px solid rgba(201,169,110,0.25)', borderRadius: 14,
            padding: '24px 28px', marginBottom: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--white)', marginBottom: 4, fontFamily: 'var(--display)' }}>
                Unlock your full potential
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Get unlimited resume tailoring, career inbox, interview prep, and more with Pro.
              </div>
            </div>
            <Link to="/#pricing-anchor" style={{
              background: 'var(--accent)', color: '#000', fontWeight: 700,
              fontSize: 14, padding: '10px 22px', borderRadius: 10,
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}>
              View Plans
            </Link>
          </div>
        )}

      </div>

      <footer className="footer" style={{ marginTop: 40 }}>
        <span className="footer-logo">&#9670; ResumeAI</span>
        <span className="footer-text">&copy; 2026 &middot; Your Complete Career Platform</span>
      </footer>
    </div>
  )
}
