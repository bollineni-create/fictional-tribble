import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

interface Application {
  id: string
  job_title: string
  company: string
  location: string
  salary: string
  status: string
  apply_url: string
  notes: string
  applied_at: string | null
  created_at: string
}

const COLUMNS = [
  { key: 'saved', label: '&#128278; Saved', color: 'var(--text-muted)' },
  { key: 'applied', label: '&#128232; Applied', color: 'var(--accent)' },
  { key: 'interviewing', label: '&#127908; Interview', color: '#6bb5e0' },
  { key: 'offer', label: '&#127881; Offer', color: 'var(--green)' },
  { key: 'rejected', label: '&#10060; Rejected', color: 'var(--error)' },
]

export default function ApplicationTracker() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [addingNew, setAddingNew] = useState(false)
  const [newApp, setNewApp] = useState({ job_title: '', company: '', location: '', salary: '', apply_url: '', notes: '' })

  useEffect(() => {
    if (user) loadApplications()
    else setLoading(false)
  }, [user])

  const loadApplications = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('applications')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
    setApplications(data || [])
    setLoading(false)
  }

  const addApplication = async () => {
    if (!user) return
    if (!newApp.job_title.trim()) { showToast('Job title is required'); return }

    const { error } = await supabase.from('applications').insert({
      user_id: user.id,
      job_title: newApp.job_title.trim(),
      company: newApp.company.trim(),
      location: newApp.location.trim(),
      salary: newApp.salary.trim(),
      apply_url: newApp.apply_url.trim(),
      notes: newApp.notes.trim(),
      status: 'saved',
    })

    if (error) {
      showToast('Failed to save. Please try again.')
      return
    }

    showToast('Application added!')
    setNewApp({ job_title: '', company: '', location: '', salary: '', apply_url: '', notes: '' })
    setAddingNew(false)
    loadApplications()
  }

  const updateStatus = async (id: string, newStatus: string) => {
    const updates: any = { status: newStatus }
    if (newStatus === 'applied' && !applications.find(a => a.id === id)?.applied_at) {
      updates.applied_at = new Date().toISOString()
    }
    await supabase.from('applications').update(updates).eq('id', id)
    loadApplications()
  }

  const deleteApplication = async (id: string) => {
    if (!confirm('Delete this application?')) return
    await supabase.from('applications').delete().eq('id', id)
    loadApplications()
  }

  const getByStatus = (status: string) => applications.filter(a => a.status === status)

  // Stats
  const totalApplied = applications.filter(a => a.status !== 'saved').length
  const interviews = applications.filter(a => a.status === 'interviewing').length
  const offers = applications.filter(a => a.status === 'offer').length

  if (!user) {
    return (
      <div className="app-container" style={{ maxWidth: 960 }}>
        <nav className="app-nav">
          <Link className="logo" to="/"><span className="logo-icon">&#9670;</span><span className="logo-text">ResumeAI</span></Link>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link to="/app" className="nav-link">Resume Builder</Link>
            <Link to="/jobs" className="nav-link">Job Search</Link>
            <Link to="/tracker" className="nav-link" style={{ color: 'var(--accent)' }}>Tracker</Link>
            <Link to="/interview" className="nav-link">Interview Prep</Link>
          </div>
        </nav>
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128203;</div>
          <h2 className="form-title">Track Your Applications</h2>
          <p className="form-sub">Log in to save and track your job applications with a Kanban board.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container" style={{ maxWidth: 960 }}>
      <nav className="app-nav">
        <Link className="logo" to="/"><span className="logo-icon">&#9670;</span><span className="logo-text">ResumeAI</span></Link>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link to="/app" className="nav-link">Resume Builder</Link>
          <Link to="/jobs" className="nav-link">Job Search</Link>
          <Link to="/tracker" className="nav-link" style={{ color: 'var(--accent)' }}>Tracker</Link>
          <Link to="/interview" className="nav-link">Interview Prep</Link>
        </div>
      </nav>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 20 }}>
        <div>
          <h2 className="form-title">&#128203; Application Tracker</h2>
          <p className="form-sub" style={{ marginBottom: 0 }}>
            {totalApplied} applied &middot; {interviews} interviewing &middot; {offers} offer{offers !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setAddingNew(true)} style={{ padding: '10px 20px', fontSize: 14 }}>
          + Add Application
        </button>
      </div>

      {/* Add New Form */}
      {addingNew && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 20, animation: 'fadeIn 0.3s ease-out' }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--white)', marginBottom: 16 }}>Add New Application</h3>
          <div className="form-grid">
            <div className="form-group">
              <label className="label">Job Title *</label>
              <input className="input" placeholder="e.g. Senior Engineer" value={newApp.job_title} onChange={(e) => setNewApp({ ...newApp, job_title: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Company</label>
              <input className="input" placeholder="e.g. Google" value={newApp.company} onChange={(e) => setNewApp({ ...newApp, company: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Location</label>
              <input className="input" placeholder="e.g. San Francisco, CA" value={newApp.location} onChange={(e) => setNewApp({ ...newApp, location: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Salary</label>
              <input className="input" placeholder="e.g. $120K - $150K" value={newApp.salary} onChange={(e) => setNewApp({ ...newApp, salary: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="label">Notes</label>
            <textarea className="textarea" rows={2} placeholder="Any notes about this application..." value={newApp.notes} onChange={(e) => setNewApp({ ...newApp, notes: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={addApplication} style={{ padding: '10px 20px', fontSize: 14 }}>Save</button>
            <button className="btn-secondary" onClick={() => setAddingNew(false)} style={{ padding: '10px 20px', fontSize: 14 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {loading ? (
        <div className="generating" style={{ padding: '40px 0' }}>
          <div className="spinner"></div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS.length}, 1fr)`, gap: 12, overflowX: 'auto' }}>
          {COLUMNS.map((col) => {
            const items = getByStatus(col.key)
            return (
              <div key={col.key} style={{ minWidth: 160 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: col.color,
                  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span dangerouslySetInnerHTML={{ __html: col.label }} />
                  <span style={{
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '1px 8px', fontSize: 11,
                  }}>{items.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map((app) => (
                    <div key={app.id} style={{
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 10, padding: '12px 14px', fontSize: 13,
                    }}>
                      <div style={{ fontWeight: 600, color: 'var(--white)', marginBottom: 2 }}>{app.job_title}</div>
                      {app.company && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{app.company}</div>}
                      {app.salary && <div style={{ color: 'var(--accent)', fontSize: 12, marginTop: 2 }}>{app.salary}</div>}
                      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                        <select
                          value={app.status}
                          onChange={(e) => updateStatus(app.id, e.target.value)}
                          style={{
                            background: 'var(--bg)', border: '1px solid var(--border)',
                            color: 'var(--text)', borderRadius: 6, padding: '2px 6px',
                            fontSize: 11, fontFamily: 'var(--font)', cursor: 'pointer',
                          }}
                        >
                          {COLUMNS.map((c) => (
                            <option key={c.key} value={c.key}>{c.key}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => deleteApplication(app.id)}
                          style={{
                            background: 'none', border: '1px solid var(--border)',
                            color: 'var(--text-muted)', borderRadius: 6, padding: '2px 8px',
                            fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font)',
                          }}
                        >&#10005;</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
