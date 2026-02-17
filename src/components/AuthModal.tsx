import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: 'login' | 'signup'
}

export default function AuthModal({ isOpen, onClose, initialTab = 'login' }: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'signup'>(initialTab)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, signup } = useAuth()
  const { showToast } = useToast()

  // Login fields
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Signup fields
  const [signupName, setSignupName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')

  const handleLogin = async () => {
    if (!loginEmail || !loginPassword) { setError('Please fill in all fields'); return }
    setLoading(true)
    setError('')
    const result = await login(loginEmail, loginPassword)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    onClose()
  }

  const handleSignup = async () => {
    if (!signupName || !signupEmail || !signupPassword) { setError('Please fill in all fields'); return }
    if (signupPassword.length < 6) { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    setError('')
    const result = await signup(signupName, signupEmail, signupPassword)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    if (result.needsConfirmation) {
      onClose()
      showToast('Check your email to confirm your account, or log in if you already have one!', 5000)
      return
    }
    onClose()
  }

  const switchTab = (t: 'login' | 'signup') => {
    setTab(t)
    setError('')
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <button className="modal-close" onClick={onClose}>&#10005;</button>
        <div className="modal-icon">&#128274;</div>
        <h2 className="modal-title">{tab === 'login' ? 'Welcome Back' : 'Create Account'}</h2>

        <div className="auth-tabs">
          <button className={`auth-tab${tab === 'login' ? ' active' : ''}`} onClick={() => switchTab('login')}>Log In</button>
          <button className={`auth-tab${tab === 'signup' ? ' active' : ''}`} onClick={() => switchTab('signup')}>Sign Up</button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {tab === 'login' ? (
          <div>
            <input className="auth-input" type="email" placeholder="Email address"
              value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
            <input className="auth-input" type="password" placeholder="Password"
              value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
            <button className="modal-cta" onClick={handleLogin} disabled={loading}>
              {loading ? 'Logging in...' : 'Log In'}
            </button>
          </div>
        ) : (
          <div>
            <input className="auth-input" type="text" placeholder="Full name"
              value={signupName} onChange={(e) => setSignupName(e.target.value)} />
            <input className="auth-input" type="email" placeholder="Email address"
              value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} />
            <input className="auth-input" type="password" placeholder="Password (min 6 characters)"
              value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSignup()} />
            <button className="modal-cta" onClick={handleSignup} disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </div>
        )}

        <p className="modal-note" style={{ marginTop: 16 }}>Save your resumes and track your Pro subscription</p>
      </div>
    </div>
  )
}
