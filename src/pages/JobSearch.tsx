import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, withTimeout } from '../lib/supabase'
import { useToast } from '../components/Toast'
import UpgradeModal from '../components/UpgradeModal'

interface Job {
  id: string
  title: string
  company: string
  companyLogo: string | null
  location: string
  isRemote: boolean
  salary: string
  description: string
  highlights: any
  applyUrl: string
  source: string
  postedAt: string
  employmentType: string
}

export default function JobSearch() {
  const { user, isPro } = useAuth()
  const { showToast } = useToast()

  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [totalResults, setTotalResults] = useState(0)
  const [searched, setSearched] = useState(false)
  const [page, setPage] = useState(1)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    try {
      const { data: { session } } = await withTimeout(supabase.auth.getSession(), 5000)
      if (session) headers['Authorization'] = 'Bearer ' + session.access_token
    } catch {}
    return headers
  }

  const searchJobs = async (pageNum = 1) => {
    if (!query.trim()) return
    setLoading(true)
    setSelectedJob(null)

    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/search-jobs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: query.trim(),
          location: location.trim() || undefined,
          remote: remoteOnly || undefined,
          page: pageNum,
        }),
      })

      const data = await res.json()
      if (data.limitReached) { setUpgradeOpen(true); return }
      if (!res.ok || data.error) throw new Error(data.error || 'Search failed')

      setJobs(data.jobs)
      setTotalResults(data.totalResults)
      setPage(pageNum)
      setSearched(true)
      if (typeof data.remaining === 'number') setRemaining(data.remaining)
    } catch (err: any) {
      showToast(err.message || 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const timeSince = (dateStr: string) => {
    if (!dateStr) return ''
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
    return new Date(dateStr).toLocaleDateString()
  }

  return (
    <div className="app-container" style={{ maxWidth: 960 }}>
      <nav className="app-nav">
        <Link className="logo" to="/">
          <span className="logo-icon">&#9670;</span>
          <span className="logo-text">ResumeAI</span>
        </Link>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link to="/app" className="nav-link">Resume Builder</Link>
          <Link to="/jobs" className="nav-link" style={{ color: 'var(--accent)' }}>Job Search</Link>
          <Link to="/tracker" className="nav-link">Tracker</Link>
          <Link to="/interview" className="nav-link">Interview Prep</Link>
        </div>
      </nav>

      <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
        <h2 className="form-title" style={{ marginTop: 8 }}>&#128269; Find Your Next Job</h2>
        <p className="form-sub">Search across thousands of job listings. AI-match with your resume.</p>

        {/* Search Form */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: 2, minWidth: 200 }}
            placeholder="Job title, company, or keywords..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchJobs()}
          />
          <input
            className="input"
            style={{ flex: 1, minWidth: 150 }}
            placeholder="Location (optional)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchJobs()}
          />
          <button className="btn-primary" onClick={() => searchJobs()} disabled={loading} style={{ padding: '12px 24px' }}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} />
            Remote only
          </label>
          {remaining !== null && !isPro && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {remaining} search{remaining !== 1 ? 'es' : ''} remaining today
            </span>
          )}
        </div>

        {/* Results */}
        {loading && (
          <div className="generating" style={{ padding: '40px 0' }}>
            <div className="spinner"></div>
            <p className="generating-sub">Searching job listings...</p>
          </div>
        )}

        {!loading && searched && jobs.length === 0 && (
          <div className="empty-state">
            No jobs found. Try different search terms or a broader location.
          </div>
        )}

        {!loading && jobs.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: selectedJob ? '1fr 1fr' : '1fr', gap: 16 }}>
            {/* Job List */}
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                {totalResults} result{totalResults !== 1 ? 's' : ''} found
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className="saved-card"
                    style={{
                      borderColor: selectedJob?.id === job.id ? 'var(--accent)' : undefined,
                      background: selectedJob?.id === job.id ? 'var(--accent-glow)' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      {job.companyLogo && (
                        <img
                          src={job.companyLogo}
                          alt=""
                          style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain', background: '#fff', padding: 2 }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      )}
                      <div style={{ flex: 1 }}>
                        <div className="saved-card-title">{job.title}</div>
                        <div className="saved-card-meta">
                          {job.company} &middot; {job.location}
                          {job.isRemote && ' (Remote)'}
                          {job.salary && ` &middot; ${job.salary}`}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                          {job.source} &middot; {timeSince(job.postedAt)}
                          {job.employmentType && ` &middot; ${job.employmentType.replace('_', ' ')}`}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                {page > 1 && (
                  <button className="copy-btn" onClick={() => searchJobs(page - 1)}>&larr; Previous</button>
                )}
                <span style={{ fontSize: 14, color: 'var(--text-muted)', padding: '8px 12px' }}>Page {page}</span>
                {jobs.length >= 10 && (
                  <button className="copy-btn" onClick={() => searchJobs(page + 1)}>Next &rarr;</button>
                )}
              </div>
            </div>

            {/* Job Detail Panel */}
            {selectedJob && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 14, padding: 24, maxHeight: '70vh', overflowY: 'auto',
                position: 'sticky', top: 20,
              }}>
                <h3 style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, color: 'var(--white)', marginBottom: 8 }}>
                  {selectedJob.title}
                </h3>
                <p style={{ fontSize: 15, color: 'var(--text-muted)', marginBottom: 4 }}>
                  {selectedJob.company} &middot; {selectedJob.location}
                </p>
                {selectedJob.salary && (
                  <p style={{ fontSize: 15, color: 'var(--accent)', marginBottom: 16 }}>{selectedJob.salary}</p>
                )}

                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                  {selectedJob.applyUrl && (
                    <a href={selectedJob.applyUrl} target="_blank" rel="noopener noreferrer" className="btn-primary"
                      style={{ textDecoration: 'none', display: 'inline-block', padding: '10px 20px', fontSize: 14 }}>
                      Apply Now &#8599;
                    </a>
                  )}
                  <Link to={`/app?jobTitle=${encodeURIComponent(selectedJob.title)}&company=${encodeURIComponent(selectedJob.company)}`}
                    className="pro-export-btn" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                    &#10024; Customize Resume
                  </Link>
                </div>

                <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {selectedJob.description?.substring(0, 2000)}
                  {(selectedJob.description?.length || 0) > 2000 && '...'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <UpgradeModal isOpen={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  )
}
