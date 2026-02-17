import { useState, useRef, useEffect } from 'react'

const STRIPE_PK = import.meta.env.VITE_STRIPE_PK || 'pk_live_51T1fqEFyD3IgcpECoSOIFPs59HLLvC7udSHohLA45WWYc8TW5nSqFCTG04uORZYBlgUoF8UkobWT2KR1KBwSOYUe00maxfwAsS'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  showSuccess?: boolean
  defaultPlan?: 'pro' | 'max'
}

export default function UpgradeModal({ isOpen, onClose, showSuccess = false, defaultPlan = 'pro' }: UpgradeModalProps) {
  const [view, setView] = useState<'pitch' | 'checkout' | 'success'>(showSuccess ? 'success' : 'pitch')
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'max'>(defaultPlan)
  const [loading, setLoading] = useState(false)
  const checkoutRef = useRef<any>(null)
  const stripeRef = useRef<any>(null)

  useEffect(() => {
    if (showSuccess) setView('success')
  }, [showSuccess])

  useEffect(() => {
    setSelectedPlan(defaultPlan)
  }, [defaultPlan])

  const destroyCheckout = () => {
    if (checkoutRef.current) {
      checkoutRef.current.destroy()
      checkoutRef.current = null
    }
  }

  const handleClose = () => {
    destroyCheckout()
    setView('pitch')
    onClose()
  }

  const showPitch = () => {
    destroyCheckout()
    setView('pitch')
  }

  const startCheckout = async (plan: 'pro' | 'max') => {
    setLoading(true)
    setSelectedPlan(plan)
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to start checkout')

      if (!stripeRef.current) {
        stripeRef.current = Stripe(STRIPE_PK)
      }

      setView('checkout')

      await new Promise((r) => setTimeout(r, 100))

      checkoutRef.current = await stripeRef.current.initEmbeddedCheckout({
        clientSecret: data.clientSecret,
      })
      checkoutRef.current.mount('#checkout-container')
    } catch (err: any) {
      alert('Could not start checkout: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const planLabel = selectedPlan === 'max' ? 'Max' : 'Pro'
  const planPrice = selectedPlan === 'max' ? '$19' : '$9'

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}>
      <div className={`modal${view === 'checkout' ? ' checkout-active' : ''}`}>
        {view === 'pitch' && (
          <>
            <button className="modal-close" onClick={handleClose}>&#10005;</button>
            <div className="modal-icon">&#128640;</div>
            <h2 className="modal-title">Upgrade Your Plan</h2>
            <p className="modal-desc">Unlock more power with a paid plan.</p>

            {/* Plan toggle cards */}
            <div style={{ display: 'flex', gap: 12, margin: '20px 0' }}>
              <div
                onClick={() => setSelectedPlan('pro')}
                style={{
                  flex: 1, padding: 16, borderRadius: 12, cursor: 'pointer',
                  border: selectedPlan === 'pro' ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: selectedPlan === 'pro' ? 'var(--accent-glow)' : 'var(--surface)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--white)' }}>Pro</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', margin: '4px 0' }}>$9<span style={{ fontSize: 13, fontWeight: 400 }}>/mo</span></div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>10 generations/day, exports, inbox, weekly alerts</div>
              </div>
              <div
                onClick={() => setSelectedPlan('max')}
                style={{
                  flex: 1, padding: 16, borderRadius: 12, cursor: 'pointer',
                  border: selectedPlan === 'max' ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: selectedPlan === 'max' ? 'var(--accent-glow)' : 'var(--surface)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--white)' }}>Max</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', margin: '4px 0' }}>$19<span style={{ fontSize: 13, fontWeight: 400 }}>/mo</span></div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Unlimited everything, daily alerts, priority AI</div>
              </div>
            </div>

            <ul className="modal-features">
              {selectedPlan === 'pro' ? (
                <>
                  <li>&#10003; 10 resume generations/day</li>
                  <li>&#10003; 25 job searches/day</li>
                  <li>&#10003; 5 tailors, ATS checks, interview preps/day</li>
                  <li>&#10003; Export to DOCX &amp; PDF</li>
                  <li>&#10003; Career inbox &amp; email</li>
                  <li>&#10003; Weekly/monthly job alerts</li>
                </>
              ) : (
                <>
                  <li>&#10003; Unlimited resume generations</li>
                  <li>&#10003; Unlimited job searches &amp; tailoring</li>
                  <li>&#10003; Unlimited ATS checks &amp; interview prep</li>
                  <li>&#10003; Export to DOCX &amp; PDF</li>
                  <li>&#10003; Career inbox &amp; email</li>
                  <li>&#10003; Daily job alerts</li>
                  <li>&#10003; Priority AI processing</li>
                </>
              )}
            </ul>
            <button className="modal-cta" onClick={() => startCheckout(selectedPlan)} disabled={loading}>
              {loading ? 'Loading...' : `Upgrade to ${planLabel} — ${planPrice}/mo`}
            </button>
            <p className="modal-note">Cancel anytime &middot; Secure payment via Stripe</p>
          </>
        )}

        {view === 'checkout' && (
          <>
            <div className="checkout-header">
              <button className="checkout-back-btn" onClick={showPitch}>&#8592; Back</button>
              <div className="checkout-header-title">
                <span style={{ color: 'var(--accent)' }}>&#9670;</span> ResumeAI {planLabel} — {planPrice}/mo
              </div>
              <button className="checkout-close-btn" onClick={handleClose}>&#10005;</button>
            </div>
            <div id="checkout-container"></div>
          </>
        )}

        {view === 'success' && (
          <>
            <button className="modal-close" onClick={handleClose}>&#10005;</button>
            <div className="modal-icon">&#127881;</div>
            <h2 className="modal-title">Welcome to {planLabel}!</h2>
            <p className="modal-desc">Your upgrade is complete. Enjoy your new features!</p>
            <button className="modal-cta" onClick={handleClose}>Start Creating</button>
          </>
        )}
      </div>
    </div>
  )
}
