import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import StripePricingTable from '../components/StripePricingTable'
import { useAuth } from '../context/AuthContext'

const PAYMENT_LINK_PRO = import.meta.env.VITE_STRIPE_PAYMENT_LINK_PRO || 'https://buy.stripe.com/bJe9ATdgP65g8tube1afS02'
const PAYMENT_LINK_MAX = import.meta.env.VITE_STRIPE_PAYMENT_LINK_MAX || 'https://buy.stripe.com/8x28wPa4D65g4de95TafS03'
const PRICING_TABLE_ID = import.meta.env.VITE_STRIPE_PRICING_TABLE_ID || ''

const FEATURES = [
  {
    key: 'resume',
    icon: '\u26A1',
    tab: 'Smart Resume Builder',
    title: 'AI-Powered Resume Builder',
    desc: 'Upload your resume in any format. Our AI parses your experience, asks clarifying questions, and generates a polished, uniform professional document — ready to send.',
    bullets: ['Upload PDF or DOCX', 'AI extracts skills, education & experience', 'Generates clean, uniform format', 'One-click export to DOCX & PDF'],
    cta: 'Build Your Resume',
    route: '/onboard',
  },
  {
    key: 'tailor',
    icon: '\uD83D\uDD27',
    tab: 'Resume Tailoring',
    title: 'Tailor for Every Job',
    desc: 'Paste any job listing and get a tailored version of your resume in seconds. See exactly what changed, why it matters, and where you have skill gaps.',
    bullets: ['One-click tailoring per listing', 'Side-by-side diff view', 'Gap analysis & suggestions', 'ATS optimization score'],
    cta: 'Try Tailoring',
    route: '/onboard',
  },
  {
    key: 'jobs',
    icon: '\uD83D\uDD0D',
    tab: 'Job Search',
    title: 'Smart Job Search & Matching',
    desc: 'Search thousands of real listings from top job boards. Every result is scored against your profile so you can focus on jobs where you\'re the best fit.',
    bullets: ['Thousands of live listings', 'AI match scoring per job', 'Save & track applications', 'Filter by role, location, salary'],
    cta: 'Search Jobs',
    route: '/jobs',
  },
  {
    key: 'inbox',
    icon: '\uD83D\uDCEC',
    tab: 'Career Inbox',
    title: 'Your Career Inbox',
    desc: 'Get a dedicated email address for all your job applications. Every message — recruiter replies, interview invites, offers — organized in one secure place.',
    bullets: ['Dedicated career email', 'Auto-linked to applications', 'Inbound & outbound tracking', 'Never lose a recruiter reply'],
    cta: 'Open Inbox',
    route: '/inbox',
  },
  {
    key: 'interview',
    icon: '\uD83C\uDF93',
    tab: 'Interview Prep',
    title: 'AI Interview Prep',
    desc: 'Get personalized interview questions based on the role, company briefs with insider context, and salary negotiation tips — all tailored to your skill gaps.',
    bullets: ['Role-specific questions', 'Company research briefs', 'Salary & negotiation tips', 'Personalized to your gaps'],
    cta: 'Start Prepping',
    route: '/interview',
  },
  {
    key: 'alerts',
    icon: '\uD83D\uDD14',
    tab: 'Job Alerts',
    title: 'Smart Job Alerts',
    desc: 'Set your preferences — target roles, locations, salary range — and get notified when better opportunities appear. Daily, weekly, or monthly digests.',
    bullets: ['Custom keyword & location filters', 'Salary range targeting', 'Daily, weekly, or monthly', 'Evolves with your career'],
    cta: 'Set Preferences',
    route: '/preferences',
  },
]

export default function Landing() {
  const navigate = useNavigate()
  const { user, isPro, isMax, tier } = useAuth()
  const [searchParams] = useSearchParams()
  const [checkoutSuccess, setCheckoutSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState(0)

  // Detect return from Stripe Checkout / Payment Link
  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    const success = searchParams.get('success')
    if (sessionId || success === 'true') {
      setCheckoutSuccess(true)
      // Clean URL
      window.history.replaceState({}, '', '/')
    }
  }, [searchParams])

  return (
    <div className="container">
      <Navbar />

      <div className="hero">
        <div className="badge">&#10022; Your Complete Career Platform</div>
        <h1 className="hero-title">
          Upload. Tailor. Apply.<br />
          <span className="hero-accent">Land Your Dream Job.</span>
        </h1>
        <p className="hero-sub">
          Upload your resume, and our AI builds a tailored version for every job you apply to.
          Search jobs, track applications, prep for interviews, and manage all correspondence — all in one place.
        </p>
        <div className="hero-ctas">
          <button className="btn-primary" onClick={() => navigate('/onboard')}>Get Started — Free</button>
          <button className="btn-secondary" onClick={() => navigate('/jobs')}>Browse Jobs</button>
        </div>
        <p className="hero-note">Upload your resume &middot; AI extracts your info &middot; Tailored for every job</p>
      </div>

      {/* 30-Day Free Trial Banner */}
      <div style={{
        maxWidth: 800, margin: '0 auto 48px', padding: 0,
        background: 'linear-gradient(135deg, rgba(201,169,110,0.12) 0%, rgba(201,169,110,0.04) 100%)',
        border: '1.5px solid rgba(201,169,110,0.3)', borderRadius: 18,
        overflow: 'hidden', position: 'relative',
      }}>
        {/* Decorative accent line at top */}
        <div style={{
          height: 3, background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
          width: '100%',
        }} />

        <div style={{
          display: 'flex', alignItems: 'center', gap: 32,
          padding: '32px 36px', flexWrap: 'wrap', justifyContent: 'center',
        }}>
          {/* Left: Trial graphic / icon cluster */}
          <div style={{
            flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center',
            minWidth: 120,
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 30px rgba(201,169,110,0.25)',
              position: 'relative',
            }}>
              <span style={{ fontSize: 36, lineHeight: 1, filter: 'brightness(0)' }}>&#128640;</span>
              {/* Orbiting dots */}
              <div style={{
                position: 'absolute', width: 100, height: 100,
                animation: 'spin 8s linear infinite',
              }}>
                <div style={{
                  position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)',
                  width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', opacity: 0.6,
                }} />
                <div style={{
                  position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
                  width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', opacity: 0.4,
                }} />
              </div>
            </div>
            <div style={{
              marginTop: 12, fontFamily: 'var(--display)', fontSize: 28, fontWeight: 700,
              color: 'var(--accent)', lineHeight: 1,
            }}>
              30
            </div>
            <div style={{
              fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}>
              Days Free
            </div>
          </div>

          {/* Right: Copy + CTA */}
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{
              display: 'inline-block', background: 'rgba(201,169,110,0.2)', color: 'var(--accent)',
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
              letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase',
            }}>
              Limited Time Offer
            </div>
            <h3 style={{
              fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700,
              color: 'var(--white)', marginBottom: 8, lineHeight: 1.3,
            }}>
              Try Pro Free for 30 Days
            </h3>
            <p style={{
              fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 16, maxWidth: 380,
            }}>
              Unlimited resume tailoring, 25 daily job searches, career inbox, interview prep, and export to DOCX/PDF.
              No credit card required to start.
            </p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn-primary"
                onClick={() => {
                  const el = document.getElementById('pricing-anchor')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
                style={{ fontSize: 14, padding: '12px 24px' }}
              >
                Start Free Trial
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Cancel anytime &middot; No commitment
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div style={{ maxWidth: 960, margin: '0 auto 48px', padding: '0 20px' }}>
        <h2 className="section-title" style={{ marginBottom: 32 }}>How It Works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { num: '1', icon: '&#128196;', title: 'Upload Resume', desc: 'Upload your PDF or DOCX. AI extracts your experience, skills, and education.' },
            { num: '2', icon: '&#10024;', title: 'Tailor & Generate', desc: 'Answer a few questions about your target job. Get a polished, uniform resume.' },
            { num: '3', icon: '&#128269;', title: 'Find & Apply', desc: 'Search jobs with match scoring. Tailor your resume for each listing.' },
            { num: '4', icon: '&#128236;', title: 'Communicate & Prep', desc: 'Manage correspondence in your career inbox. AI preps you for interviews.' },
          ].map(step => (
            <div key={step.num} style={{
              textAlign: 'center',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 14, padding: 24,
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }} dangerouslySetInnerHTML={{ __html: step.icon }} />
              <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, color: 'var(--white)', marginBottom: 6 }}>
                {step.title}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{step.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabbed Features */}
      <div style={{ padding: '40px 0 60px', borderTop: '1px solid var(--border)' }}>
        <h2 className="section-title" style={{ marginBottom: 28 }}>Everything You Need</h2>

        {/* Tab bar */}
        <div style={{
          display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'nowrap',
          marginBottom: 32, padding: '0 8px', overflowX: 'auto',
        }}>
          {FEATURES.map((f, i) => (
            <button
              key={f.key}
              onClick={() => setActiveTab(i)}
              style={{
                background: activeTab === i ? 'var(--accent)' : 'var(--surface)',
                color: activeTab === i ? '#1a1a1a' : 'var(--text-muted)',
                border: activeTab === i ? 'none' : '1px solid var(--border)',
                borderRadius: 10, padding: '9px 14px',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'var(--font)', transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ marginRight: 6 }}>{f.icon}</span>
              {f.tab}
            </button>
          ))}
        </div>

        {/* Tab content panel */}
        {(() => {
          const f = FEATURES[activeTab]
          return (
            <div style={{
              maxWidth: 800, margin: '0 auto',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 18, padding: '40px 44px',
              display: 'flex', gap: 36, alignItems: 'flex-start', flexWrap: 'wrap',
            }}>
              {/* Left: icon + title + desc */}
              <div style={{ flex: '1 1 300px' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: 'var(--accent-glow)', border: '1px solid rgba(201,169,110,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, marginBottom: 16,
                }}>
                  {f.icon}
                </div>
                <h3 style={{
                  fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700,
                  color: 'var(--white)', marginBottom: 12, lineHeight: 1.3,
                }}>
                  {f.title}
                </h3>
                <p style={{
                  fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 20,
                }}>
                  {f.desc}
                </p>
                <button
                  className="btn-primary"
                  onClick={() => navigate(f.route)}
                  style={{ fontSize: 14, padding: '11px 22px' }}
                >
                  {f.cta}
                </button>
              </div>

              {/* Right: bullet list */}
              <div style={{ flex: '0 0 220px', paddingTop: 8 }}>
                {f.bullets.map((b, j) => (
                  <div key={j} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    marginBottom: 14,
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--accent-glow)', border: '1px solid rgba(201,169,110,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: 'var(--accent)', fontWeight: 700, marginTop: 1,
                    }}>
                      &#10003;
                    </div>
                    <span style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{b}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
      </div>

      {/* Checkout Success Banner */}
      {checkoutSuccess && (
        <div style={{
          maxWidth: 700, margin: '0 auto 24px', padding: '16px 24px',
          background: 'linear-gradient(135deg, rgba(0,200,100,0.15), rgba(0,200,100,0.05))',
          border: '1px solid rgba(0,200,100,0.3)', borderRadius: 12,
          textAlign: 'center', color: 'var(--white)',
        }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>&#127881;</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Welcome to your new plan!</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Your subscription is active. All your upgraded features are ready to use.
          </div>
        </div>
      )}

      <div className="pricing" id="pricing-anchor">
        <h2 className="section-title">Simple Pricing</h2>

        {/* Stripe Pricing Table — rendered if configured */}
        {PRICING_TABLE_ID ? (
          <div style={{ marginBottom: 32 }}>
            <StripePricingTable
              clientReferenceId={user?.id}
              customerEmail={user?.email}
            />
          </div>
        ) : (
          /* Fallback: Custom pricing cards with optional Buy Buttons */
          <div className="pricing-cards" style={{ maxWidth: 960 }}>
            {/* Free Tier */}
            <div className="pricing-card">
              <div className="pricing-tier">Free</div>
              <div className="pricing-price">$0<span className="pricing-period">/forever</span></div>
              <ul className="pricing-list">
                <li className="pricing-item">&#10003; 3 resume generations/day</li>
                <li className="pricing-item">&#10003; AI resume parsing</li>
                <li className="pricing-item">&#10003; 5 job searches/day</li>
                <li className="pricing-item">&#10003; 1 ATS check/day</li>
                <li className="pricing-item">&#10003; 1 interview prep/day</li>
                <li className="pricing-item">&#10003; Application tracker</li>
                <li className="pricing-item" style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>&#10007; Export to DOCX &amp; PDF</li>
                <li className="pricing-item" style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>&#10007; Career inbox</li>
                <li className="pricing-item" style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>&#10007; Job alerts</li>
              </ul>
              <button className="pricing-btn" onClick={() => navigate('/onboard')}>Start Free</button>
            </div>

            {/* Pro Tier */}
            <div className="pricing-card pro">
              <div className="pro-badge">POPULAR</div>
              <div className="pricing-tier">Pro</div>
              <div className="pricing-price">$9<span className="pricing-period">/month</span></div>
              <ul className="pricing-list">
                <li className="pricing-item">&#10003; 10 resume generations/day</li>
                <li className="pricing-item">&#10003; 25 job searches/day</li>
                <li className="pricing-item">&#10003; 5 resume tailors/day</li>
                <li className="pricing-item">&#10003; 5 ATS checks/day</li>
                <li className="pricing-item">&#10003; 5 interview preps/day</li>
                <li className="pricing-item">&#10003; Export to DOCX &amp; PDF</li>
                <li className="pricing-item">&#10003; Career inbox &amp; email</li>
                <li className="pricing-item">&#10003; Weekly/monthly job alerts</li>
              </ul>
              <a
                href={`${PAYMENT_LINK_PRO}${user?.email ? `?prefilled_email=${encodeURIComponent(user.email)}` : ''}`}
                className="pricing-btn pro-btn"
                style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
              >
                Upgrade to Pro
              </a>
            </div>

            {/* Max Tier */}
            <div className="pricing-card" style={{ border: '1.5px solid var(--accent)', position: 'relative' }}>
              <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'var(--accent)', color: '#000', fontSize: 11, fontWeight: 700, padding: '3px 14px', borderRadius: 20, letterSpacing: 0.5 }}>MAX POWER</div>
              <div className="pricing-tier">Max</div>
              <div className="pricing-price">$20<span className="pricing-period">/month</span></div>
              <ul className="pricing-list">
                <li className="pricing-item">&#10003; <strong>Unlimited</strong> resume generations</li>
                <li className="pricing-item">&#10003; <strong>Unlimited</strong> job searches</li>
                <li className="pricing-item">&#10003; <strong>Unlimited</strong> resume tailoring</li>
                <li className="pricing-item">&#10003; <strong>Unlimited</strong> ATS checks</li>
                <li className="pricing-item">&#10003; <strong>Unlimited</strong> interview prep</li>
                <li className="pricing-item">&#10003; Export to DOCX &amp; PDF</li>
                <li className="pricing-item">&#10003; Career inbox &amp; email</li>
                <li className="pricing-item">&#10003; Daily job alerts</li>
                <li className="pricing-item">&#10003; Priority AI processing</li>
              </ul>
              <a
                href={`${PAYMENT_LINK_MAX}${user?.email ? `?prefilled_email=${encodeURIComponent(user.email)}` : ''}`}
                className="pricing-btn pro-btn"
                style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
              >
                Go Max
              </a>
            </div>
          </div>
        )}

        {/* Current plan indicator for logged-in users */}
        {user && isPro && (
          <div style={{
            textAlign: 'center', marginTop: 16, padding: '12px 20px',
            background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)',
            maxWidth: 400, margin: '16px auto 0',
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              You're on the <strong style={{ color: 'var(--accent)' }}>{isMax ? 'Max' : 'Pro'}</strong> plan
            </span>
            <span style={{ margin: '0 8px', color: 'var(--border)' }}>|</span>
            <a
              href="/preferences"
              style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}
            >
              Manage subscription
            </a>
          </div>
        )}
      </div>

      <footer className="footer">
        <span className="footer-logo">&#9670; ResumeAI</span>
        <span className="footer-text">&copy; 2026 &middot; Your Complete Career Platform</span>
      </footer>
    </div>
  )
}
