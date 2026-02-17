import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AuthModal from './AuthModal'
import SavedResumesModal from './SavedResumesModal'

interface NavbarProps {
  onViewSavedResume?: (resume: any) => void
}

export default function Navbar({ onViewSavedResume }: NavbarProps) {
  const { user, profile, isPro, isMax, tier, logout } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [authTab, setAuthTab] = useState<'login' | 'signup'>('login')
  const [menuOpen, setMenuOpen] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const scrollToPricing = (e: React.MouseEvent) => {
    e.preventDefault()
    if (location.pathname !== '/') {
      navigate('/')
      setTimeout(() => {
        document.getElementById('pricing-anchor')?.scrollIntoView({ behavior: 'smooth' })
      }, 300)
    } else {
      document.getElementById('pricing-anchor')?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const openAuth = (tab: 'login' | 'signup') => {
    setAuthTab(tab)
    setAuthOpen(true)
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const handleLogout = async () => {
    setMenuOpen(false)
    await logout()
    navigate('/')
  }

  const initial = (user?.email || '?')[0].toUpperCase()

  return (
    <>
      <nav className="nav">
        <Link className="logo" to="/">
          <span className="logo-icon">&#9670;</span>
          <span className="logo-text">ResumeAI</span>
        </Link>
        <div className="nav-right">
          <a className="nav-link" href="#pricing" onClick={scrollToPricing} style={{ cursor: 'pointer' }}>Pricing</a>
          {!user ? (
            <div className="auth-nav">
              <button className="auth-btn" onClick={() => openAuth('login')}>Log In</button>
              <button className="nav-cta" onClick={() => navigate('/app')}>Get Started Free</button>
            </div>
          ) : (
            <div className="user-dropdown" ref={dropdownRef} onClick={() => setMenuOpen(!menuOpen)}>
              <div className="user-menu">
                <div className="user-avatar">{initial}</div>
              </div>
              <div className={`user-dropdown-menu${menuOpen ? ' show' : ''}`}>
                <div className="user-dropdown-item" style={{ fontWeight: 600, cursor: 'default' }}>{user.email}</div>
                {isMax && <div className="user-dropdown-item pro-badge-item">&#128293; Max Member</div>}
                {isPro && !isMax && <div className="user-dropdown-item pro-badge-item">&#11088; Pro Member</div>}
                <button className="user-dropdown-item" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setSavedOpen(true) }}>&#128196; My Resumes</button>
                <button className="user-dropdown-item" onClick={(e) => { e.stopPropagation(); handleLogout() }}>&#8617; Log Out</button>
              </div>
            </div>
          )}
        </div>
      </nav>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} initialTab={authTab} />
      <SavedResumesModal
        isOpen={savedOpen}
        onClose={() => setSavedOpen(false)}
        onView={(resume) => {
          if (onViewSavedResume) onViewSavedResume(resume)
          navigate('/app')
        }}
      />
    </>
  )
}
