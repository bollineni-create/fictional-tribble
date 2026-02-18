import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import StripePricingTable from '../components/StripePricingTable'
import StripeBuyButton from '../components/StripeBuyButton'
import { useAuth } from '../context/AuthContext'

const PAYMENT_LINK_PRO = import.meta.env.VITE_STRIPE_PAYMENT_LINK_PRO || ''
const PAYMENT_LINK_MAX = import.meta.env.VITE_STRIPE_PAYMENT_LINK_MAX || ''
const BUY_BUTTON_PRO_ID = import.meta.env.VITE_STRIPE_BUY_BUTTON_PRO_ID || ''
const BUY_BUTTON_MAX_ID = import.meta.env.VITE_STRIPE_BUY_BUTTON_MAX_ID || ''
const PRICING_TABLE_ID = import.meta.env.VITE_STRIPE_PRICING_TABLE_ID || ''

export default function Landing() {
  const navigate = useNavigate()
  const { user, isPro, isMax, tier } = useAuth()
  const [searchParams] = useSearchParams()
  const [checkoutSuccess, setCheckoutSuccess] = useState(false)

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

      {/* How It Works */}
      <div style={{ maxWidth: 800, margin: '0 auto 48px', padding: '0 20px' }}>
        <h2 className="section-title" style={{ marginBottom: 32 }}>How It Works</h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { num: '1', icon: '&#128196;', title: 'Upload Resume', desc: 'Upload your PDF or DOCX. AI extracts your experience, skills, and education.' },
            { num: '2', icon: '&#10024;', title: 'Tailor & Generate', desc: 'Answer a few questions about your target job. Get a polished, uniform resume.' },
            { num: '3', icon: '&#128269;', title: 'Find & Apply', desc: 'Search jobs with match scoring. Tailor your resume for each listing.' },
            { num: '4', icon: '&#128236;', title: 'Communicate & Prep', desc: 'Manage correspondence in your career inbox. AI preps you for interviews.' },
          ].map(step => (
            <div key={step.num} style={{
              flex: '1 1 200px', maxWidth: 240, textAlign: 'center',
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

      <div className="features">
        <div className="feature-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/onboard')}>
          <div className="feature-icon">&#9889;</div>
          <div className="feature-title">Smart Resume Builder</div>
          <div className="feature-desc">Upload your resume, AI parses it, ask you questions, and generates a uniform professional document.</div>
        </div>
        <div className="feature-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/jobs')}>
          <div className="feature-icon">&#128269;</div>
          <div className="feature-title">Job Search & Matching</div>
          <div className="feature-desc">Search thousands of listings. Each job is scored against your profile for the best fit.</div>
        </div>
        <div className="feature-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/onboard')}>
          <div className="feature-icon">&#128295;</div>
          <div className="feature-title">Resume Tailoring</div>
          <div className="feature-desc">One-click tailoring for any job listing. See what changed and why, with gap analysis.</div>
        </div>
        <div className="feature-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/inbox')}>
          <div className="feature-icon">&#128236;</div>
          <div className="feature-title">Career Inbox</div>
          <div className="feature-desc">Get a dedicated email for job applications. All correspondence in one secure place.</div>
        </div>
        <div className="feature-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/interview')}>
          <div className="feature-icon">&#127891;</div>
          <div className="feature-title">Interview Prep</div>
          <div className="feature-desc">AI-generated questions, company briefs, and salary tips — personalized to your gaps.</div>
        </div>
        <div className="feature-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/preferences')}>
          <div className="feature-icon">&#128276;</div>
          <div className="feature-title">Monthly Job Alerts</div>
          <div className="feature-desc">Set preferences and get notified about better opportunities as your career evolves.</div>
        </div>
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
              {BUY_BUTTON_PRO_ID ? (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                  <StripeBuyButton
                    buyButtonId={BUY_BUTTON_PRO_ID}
                    clientReferenceId={user?.id}
                    customerEmail={user?.email}
                  />
                </div>
              ) : PAYMENT_LINK_PRO ? (
                <a
                  href={`${PAYMENT_LINK_PRO}${user?.email ? `?prefilled_email=${encodeURIComponent(user.email)}` : ''}`}
                  className="pricing-btn pro-btn"
                  style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
                >
                  Upgrade to Pro
                </a>
              ) : (
                <button className="pricing-btn pro-btn" onClick={() => navigate('/onboard?upgrade=pro')}>
                  Upgrade to Pro
                </button>
              )}
            </div>

            {/* Max Tier */}
            <div className="pricing-card" style={{ border: '1.5px solid var(--accent)', position: 'relative' }}>
              <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'var(--accent)', color: '#000', fontSize: 11, fontWeight: 700, padding: '3px 14px', borderRadius: 20, letterSpacing: 0.5 }}>MAX POWER</div>
              <div className="pricing-tier">Max</div>
              <div className="pricing-price">$19<span className="pricing-period">/month</span></div>
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
              {BUY_BUTTON_MAX_ID ? (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                  <StripeBuyButton
                    buyButtonId={BUY_BUTTON_MAX_ID}
                    clientReferenceId={user?.id}
                    customerEmail={user?.email}
                  />
                </div>
              ) : PAYMENT_LINK_MAX ? (
                <a
                  href={`${PAYMENT_LINK_MAX}${user?.email ? `?prefilled_email=${encodeURIComponent(user.email)}` : ''}`}
                  className="pricing-btn pro-btn"
                  style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
                >
                  Go Max
                </a>
              ) : (
                <button className="pricing-btn pro-btn" onClick={() => navigate('/onboard?upgrade=max')}>
                  Go Max
                </button>
              )}
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
