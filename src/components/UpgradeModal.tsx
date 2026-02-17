import { useState, useRef, useEffect } from 'react'

const STRIPE_PK = import.meta.env.VITE_STRIPE_PK || 'pk_live_51T1fqEFyD3IgcpECoSOIFPs59HLLvC7udSHohLA45WWYc8TW5nSqFCTG04uORZYBlgUoF8UkobWT2KR1KBwSOYUe00maxfwAsS'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  showSuccess?: boolean
}

export default function UpgradeModal({ isOpen, onClose, showSuccess = false }: UpgradeModalProps) {
  const [view, setView] = useState<'pitch' | 'checkout' | 'success'>(showSuccess ? 'success' : 'pitch')
  const [loading, setLoading] = useState(false)
  const checkoutRef = useRef<any>(null)
  const stripeRef = useRef<any>(null)

  useEffect(() => {
    if (showSuccess) setView('success')
  }, [showSuccess])

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

  const startCheckout = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to start checkout')

      if (!stripeRef.current) {
        stripeRef.current = Stripe(STRIPE_PK)
      }

      setView('checkout')

      // Small delay to ensure DOM is ready
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

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}>
      <div className={`modal${view === 'checkout' ? ' checkout-active' : ''}`}>
        {view === 'pitch' && (
          <>
            <button className="modal-close" onClick={handleClose}>&#10005;</button>
            <div className="modal-icon">&#128640;</div>
            <h2 className="modal-title">Upgrade to Pro</h2>
            <p className="modal-desc">Unlock unlimited generations, premium templates, and DOCX/PDF export.</p>
            <div className="modal-price">$9<span className="modal-period">/month</span></div>
            <ul className="modal-features">
              <li>&#10003; Unlimited generations</li>
              <li>&#10003; Premium resume templates</li>
              <li>&#10003; Export to DOCX &amp; PDF</li>
              <li>&#10003; ATS compatibility score</li>
              <li>&#10003; Priority AI processing</li>
            </ul>
            <button className="modal-cta" onClick={startCheckout} disabled={loading}>
              {loading ? 'Loading...' : 'Upgrade to Pro — $9/mo'}
            </button>
            <p className="modal-note">Cancel anytime &middot; Secure payment via Stripe</p>
          </>
        )}

        {view === 'checkout' && (
          <>
            <div className="checkout-header">
              <button className="checkout-back-btn" onClick={showPitch}>&#8592; Back</button>
              <div className="checkout-header-title">
                <span style={{ color: 'var(--accent)' }}>&#9670;</span> ResumeAI Pro — $9/mo
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
            <h2 className="modal-title">Welcome to Pro!</h2>
            <p className="modal-desc">Your upgrade is complete. You now have unlimited generations, premium templates, and export features.</p>
            <button className="modal-cta" onClick={handleClose}>Start Creating</button>
          </>
        )}
      </div>
    </div>
  )
}
