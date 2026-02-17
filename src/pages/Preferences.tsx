import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, withTimeout } from '../lib/supabase'
import { useToast } from '../components/Toast'
import AuthModal from '../components/AuthModal'

export default function Preferences() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [authOpen, setAuthOpen] = useState(false)

  const [desiredTitles, setDesiredTitles] = useState<string[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [desiredLocations, setDesiredLocations] = useState<string[]>([])
  const [newLocation, setNewLocation] = useState('')
  const [minSalary, setMinSalary] = useState('')
  const [remoteOk, setRemoteOk] = useState(true)
  const [industries, setIndustries] = useState<string[]>([])
  const [alertFrequency, setAlertFrequency] = useState('monthly')
  const [lifeChanges, setLifeChanges] = useState('')
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (user) loadPreferences()
  }, [user])

  const loadPreferences = async () => {
    if (!user) return
    try {
      const result = await withTimeout(
        Promise.resolve(
          supabase.from('job_preferences').select('*').eq('user_id', user.id).single()
        ), 8000
      )
      if (result.data) {
        const d = result.data as any
        setDesiredTitles(d.desired_titles || [])
        setDesiredLocations(d.desired_locations || [])
        setMinSalary(d.min_salary ? String(d.min_salary) : '')
        setRemoteOk(d.remote_ok ?? true)
        setIndustries(d.industries || [])
        setAlertFrequency(d.alert_frequency || 'monthly')
        setLifeChanges(d.life_changes || '')
      }
    } catch {}
    setLoaded(true)
  }

  const savePreferences = async () => {
    if (!user) return
    setSaving(true)
    try {
      const data = {
        user_id: user.id,
        desired_titles: desiredTitles,
        desired_locations: desiredLocations,
        min_salary: minSalary ? parseInt(minSalary) : null,
        remote_ok: remoteOk,
        industries,
        alert_frequency: alertFrequency,
        life_changes: lifeChanges.trim(),
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase.from('job_preferences').upsert(data, { onConflict: 'user_id' })
      if (error) throw error
      showToast('Preferences saved!')
    } catch (err: any) {
      showToast(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const addTitle = () => {
    const t = newTitle.trim()
    if (t && !desiredTitles.includes(t)) {
      setDesiredTitles(prev => [...prev, t])
      setNewTitle('')
    }
  }

  const addLocation = () => {
    const l = newLocation.trim()
    if (l && !desiredLocations.includes(l)) {
      setDesiredLocations(prev => [...prev, l])
      setNewLocation('')
    }
  }

  const toggleIndustry = (ind: string) => {
    setIndustries(prev => prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind])
  }

  const allIndustries = ['Technology', 'Finance', 'Healthcare', 'Marketing', 'Education', 'Engineering', 'Sales', 'Design', 'Legal', 'Manufacturing', 'Consulting']

  if (!user) {
    return (
      <div className="app-container">
        <nav className="app-nav">
          <Link className="logo" to="/"><span className="logo-icon">&#9670;</span><span className="logo-text">ResumeAI</span></Link>
        </nav>
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <h2 className="form-title">Job Alert Preferences</h2>
          <p className="form-sub">Sign in to set your preferences and receive personalized job alerts.</p>
          <button className="generate-btn" onClick={() => setAuthOpen(true)} style={{ maxWidth: 300 }}>Sign In</button>
        </div>
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    )
  }

  return (
    <div className="app-container">
      <nav className="app-nav">
        <Link className="logo" to="/"><span className="logo-icon">&#9670;</span><span className="logo-text">ResumeAI</span></Link>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link to="/onboard" className="nav-link">Resume</Link>
          <Link to="/jobs" className="nav-link">Jobs</Link>
          <Link to="/tracker" className="nav-link">Tracker</Link>
          <Link to="/inbox" className="nav-link">Inbox</Link>
          <Link to="/preferences" className="nav-link" style={{ color: 'var(--accent)' }}>Alerts</Link>
        </div>
      </nav>

      <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
        <h2 className="form-title">&#128276; Job Alert Preferences</h2>
        <p className="form-sub">Tell us what you're looking for and we'll send you matching jobs monthly (or weekly).</p>

        {/* Desired Job Titles */}
        <div className="form-group" style={{ marginTop: 24 }}>
          <label className="label">Desired Job Titles</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {desiredTitles.map((t, i) => (
              <span key={i} style={{
                background: 'var(--accent-glow)', color: 'var(--accent)',
                padding: '4px 12px', borderRadius: 8, fontSize: 13, border: '1px solid var(--accent)',
              }}>
                {t}
                <span style={{ cursor: 'pointer', marginLeft: 6, opacity: 0.7 }}
                  onClick={() => setDesiredTitles(prev => prev.filter((_, j) => j !== i))}>×</span>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" placeholder="e.g. Product Manager" value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTitle()} />
            <button className="copy-btn" onClick={addTitle}>Add</button>
          </div>
        </div>

        {/* Desired Locations */}
        <div className="form-group" style={{ marginTop: 20 }}>
          <label className="label">Preferred Locations</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {desiredLocations.map((l, i) => (
              <span key={i} style={{
                background: 'var(--surface)', color: 'var(--text)',
                padding: '4px 12px', borderRadius: 8, fontSize: 13, border: '1px solid var(--border)',
              }}>
                {l}
                <span style={{ cursor: 'pointer', marginLeft: 6, opacity: 0.7 }}
                  onClick={() => setDesiredLocations(prev => prev.filter((_, j) => j !== i))}>×</span>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" placeholder="e.g. Austin, TX" value={newLocation}
              onChange={e => setNewLocation(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addLocation()} />
            <button className="copy-btn" onClick={addLocation}>Add</button>
          </div>
        </div>

        {/* Salary & Remote */}
        <div className="form-grid" style={{ marginTop: 20 }}>
          <div className="form-group">
            <label className="label">Minimum Salary (annual USD)</label>
            <input className="input" type="number" placeholder="e.g. 80000" value={minSalary}
              onChange={e => setMinSalary(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">Remote Work</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text)', cursor: 'pointer', marginTop: 12 }}>
              <input type="checkbox" checked={remoteOk} onChange={e => setRemoteOk(e.target.checked)} />
              Include remote opportunities
            </label>
          </div>
        </div>

        {/* Industries */}
        <div className="form-group" style={{ marginTop: 20 }}>
          <label className="label">Industries (click to toggle)</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {allIndustries.map(ind => (
              <button key={ind} onClick={() => toggleIndustry(ind)} style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 13, border: '1px solid',
                cursor: 'pointer',
                background: industries.includes(ind) ? 'var(--accent)' : 'var(--surface)',
                color: industries.includes(ind) ? '#000' : 'var(--text)',
                borderColor: industries.includes(ind) ? 'var(--accent)' : 'var(--border)',
              }}>
                {industries.includes(ind) ? '✓ ' : ''}{ind}
              </button>
            ))}
          </div>
        </div>

        {/* Alert Frequency */}
        <div className="form-group" style={{ marginTop: 20 }}>
          <label className="label">Alert Frequency</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { key: 'weekly', label: 'Weekly' },
              { key: 'monthly', label: 'Monthly' },
              { key: 'off', label: 'Off' },
            ].map(opt => (
              <button key={opt.key} onClick={() => setAlertFrequency(opt.key)} style={{
                padding: '8px 18px', borderRadius: 10, fontSize: 14, border: '1px solid',
                cursor: 'pointer',
                background: alertFrequency === opt.key ? 'var(--accent)' : 'var(--surface)',
                color: alertFrequency === opt.key ? '#000' : 'var(--text)',
                borderColor: alertFrequency === opt.key ? 'var(--accent)' : 'var(--border)',
              }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Life Changes */}
        <div className="form-group" style={{ marginTop: 20 }}>
          <label className="label">Life Changes (optional)</label>
          <textarea className="textarea" rows={3}
            placeholder="e.g. Getting my MBA in 2027, relocating to Austin next year, transitioning from engineering to product management..."
            value={lifeChanges} onChange={e => setLifeChanges(e.target.value)} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            This helps us adjust recommendations over time as your situation evolves.
          </div>
        </div>

        <button className="generate-btn" onClick={savePreferences} disabled={saving} style={{ marginTop: 32 }}>
          {saving ? 'Saving...' : '&#128190; Save Preferences'}
        </button>
      </div>
    </div>
  )
}
