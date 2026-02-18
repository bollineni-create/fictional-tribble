import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  matchScore?: number
}

interface SavedJob {
  job_id: string
  status: string
}

export default function JobSearch() {
  const { user, isPro, tier } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

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
  const [sortBy, setSortBy] = useState<'match' | 'date'>('match')

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false)
  const [datePosted, setDatePosted] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [experienceLevel, setExperienceLevel] = useState('')
  const [radius, setRadius] = useState('')

  // User profile for match scoring
  const [userSkills, setUserSkills] = useState<string[]>([])
  const [desiredTitle, setDesiredTitle] = useState('')
  const [desiredLocation, setDesiredLocation] = useState('')
  const [hasProfile, setHasProfile] = useState(false)

  // Saved jobs
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set())
  const [savingJobId, setSavingJobId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    loadUserProfile()
    loadSavedJobs()
  }, [user])

  const loadUserProfile = async () => {
    if (!user) return
    try {
      const result = await withTimeout(
        Promise.resolve(
          supabase.from('user_profiles_extended').select('skills,preferences,location').eq('user_id', user.id).single()
        ), 8000
      )
      if (result.data) {
        const d = result.data as any
        setUserSkills(d.skills || [])
        setDesiredLocation(d.preferences?.desiredLocation || d.location || '')
        setDesiredTitle(d.preferences?.desiredTitle || '')
        setHasProfile(true)
      }
    } catch {}
  }

  const loadSavedJobs = async () => {
    if (!user) return
    try {
      const { data } = await supabase
        .from('saved_jobs')
        .select('job_id')
        .eq('user_id', user.id)
      if (data) {
        setSavedJobIds(new Set(data.map((d: any) => d.job_id)))
      }
    } catch {}
  }

  const toggleSaveJob = async (job: Job) => {
    if (!user) {
      showToast('Sign in to save jobs')
      return
    }
    setSavingJobId(job.id)
    try {
      if (savedJobIds.has(job.id)) {
        // Unsave
        await supabase.from('saved_jobs').delete().eq('user_id', user.id).eq('job_id', job.id)
        setSavedJobIds(prev => { const s = new Set(prev); s.delete(job.id); return s })
        showToast('Job removed from saved')
      } else {
        // Save
        await supabase.from('saved_jobs').upsert({
          user_id: user.id,
          job_id: job.id,
          title: job.title,
          company: job.company,
          company_logo: job.companyLogo,
          location: job.location,
          is_remote: job.isRemote,
          salary: job.salary,
          description: job.description?.substring(0, 5000),
          apply_url: job.applyUrl,
          source: job.source,
          posted_at: job.postedAt || null,
          employment_type: job.employmentType,
          match_score: job.matchScore || null,
        }, { onConflict: 'user_id,job_id' })
        setSavedJobIds(prev => new Set(prev).add(job.id))
        showToast('Job saved!')
      }
    } catch (err: any) {
      showToast('Failed to save job')
    } finally {
      setSavingJobId(null)
    }
  }

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
          userSkills: userSkills.length > 0 ? userSkills : undefined,
          desiredTitle: desiredTitle || query.trim(),
          desiredLocation: desiredLocation || location.trim(),
          datePosted: datePosted || undefined,
          employmentTypes: employmentType || undefined,
          jobRequirements: experienceLevel || undefined,
          radius: radius ? parseInt(radius) : undefined,
        }),
      })

      const data = await res.json()
      if (data.limitReached) { setUpgradeOpen(true); return }
      if (!res.ok || data.error) throw new Error(data.error || 'Search failed')

      let results = data.jobs
      if (sortBy === 'date') {
        results = [...results].sort((a: Job, b: Job) =>
          new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
        )
      }

      setJobs(results)
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

  const matchColor = (score: number) => {
    if (score >= 75) return 'var(--green)'
    if (score >= 50) return 'var(--accent)'
    return 'var(--error)'
  }

  const matchBg = (score: number) => {
    if (score >= 75) return 'rgba(92, 184, 92, 0.12)'
    if (score >= 50) return 'var(--accent-glow)'
    return 'rgba(212, 85, 74, 0.1)'
  }

  const activeFilterCount = [datePosted, employmentType, experienceLevel, radius].filter(Boolean).length

  return (
    <div className="app-container" style={{ maxWidth: 960 }}>
      <nav className="app-nav">
        <Link className="logo" to="/">
          <span className="logo-icon">&#9670;</span>
          <span className="logo-text">ResumeAI</span>
        </Link>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link to="/onboard" className="nav-link">Resume Builder</Link>
          <Link to="/jobs" className="nav-link" style={{ color: 'var(--accent)' }}>Job Search</Link>
          <Link to="/tracker" className="nav-link">Tracker</Link>
          <Link to="/interview" className="nav-link">Interview Prep</Link>
        </div>
      </nav>

      <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
        <h2 className="form-title" style={{ marginTop: 8 }}>&#128269; Find Your Next Job</h2>
        <p className="form-sub">
          {hasProfile
            ? 'Jobs are scored based on your profile. Higher match = better fit.'
            : 'Search across thousands of job listings. Complete your profile for match scoring.'}
        </p>

        {!hasProfile && user && (
          <div style={{
            background: 'var(--accent-glow)', border: '1px solid var(--accent)',
            borderRadius: 12, padding: '12px 20px', marginBottom: 20,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 14, color: 'var(--text)' }}>
              &#128161; Complete your profile to see match scores for each job
            </span>
            <Link to="/onboard" className="btn-primary" style={{ padding: '6px 16px', fontSize: 13, textDecoration: 'none' }}>
              Set Up Profile
            </Link>
          </div>
        )}

        {/* Search Form */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
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

        {/* Filter toggle + quick options */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} />
            Remote only
          </label>
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: '1px solid var(--border)', cursor: 'pointer',
              background: showFilters || activeFilterCount > 0 ? 'var(--accent)' : 'transparent',
              color: showFilters || activeFilterCount > 0 ? '#000' : 'var(--text-muted)',
            }}
          >
            &#9881; Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
          {searched && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setSortBy('match'); searchJobs(page) }} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12, border: '1px solid',
                cursor: 'pointer', background: sortBy === 'match' ? 'var(--accent)' : 'transparent',
                color: sortBy === 'match' ? '#000' : 'var(--text-muted)',
                borderColor: sortBy === 'match' ? 'var(--accent)' : 'var(--border)',
              }}>Best Match</button>
              <button onClick={() => {
                setSortBy('date')
                setJobs(prev => [...prev].sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()))
              }} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12, border: '1px solid',
                cursor: 'pointer', background: sortBy === 'date' ? 'var(--accent)' : 'transparent',
                color: sortBy === 'date' ? '#000' : 'var(--text-muted)',
                borderColor: sortBy === 'date' ? 'var(--accent)' : 'var(--border)',
              }}>Newest</button>
            </div>
          )}
          {remaining !== null && tier !== 'max' && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {remaining} search{remaining !== 1 ? 'es' : ''} remaining today
              {tier === 'free' && ' (5 free/day)'}
              {tier === 'pro' && ' (25/day)'}
            </span>
          )}
        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '16px 20px', marginBottom: 20,
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12,
          }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Date Posted</label>
              <select
                className="input"
                value={datePosted}
                onChange={e => setDatePosted(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13 }}
              >
                <option value="">Any time</option>
                <option value="today">Today</option>
                <option value="3days">Last 3 days</option>
                <option value="week">This week</option>
                <option value="month">This month</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Employment Type</label>
              <select
                className="input"
                value={employmentType}
                onChange={e => setEmploymentType(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13 }}
              >
                <option value="">All types</option>
                <option value="FULLTIME">Full-time</option>
                <option value="PARTTIME">Part-time</option>
                <option value="CONTRACTOR">Contract</option>
                <option value="INTERN">Internship</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Experience Level</label>
              <select
                className="input"
                value={experienceLevel}
                onChange={e => setExperienceLevel(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13 }}
              >
                <option value="">Any level</option>
                <option value="no_experience">No experience</option>
                <option value="under_3_years_experience">Under 3 years</option>
                <option value="more_than_3_years_experience">3+ years</option>
                <option value="no_degree">No degree required</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Radius (km)</label>
              <select
                className="input"
                value={radius}
                onChange={e => setRadius(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13 }}
              >
                <option value="">Any distance</option>
                <option value="10">10 km</option>
                <option value="25">25 km</option>
                <option value="50">50 km</option>
                <option value="100">100 km</option>
                <option value="200">200 km</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                onClick={() => { setDatePosted(''); setEmploymentType(''); setExperienceLevel(''); setRadius('') }}
                style={{
                  padding: '8px 14px', borderRadius: 8, fontSize: 12,
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-muted)', cursor: 'pointer',
                }}
              >
                Clear filters
              </button>
            </div>
          </div>
        )}

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
                          src={job.companyLogo} alt=""
                          style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain', background: '#fff', padding: 2 }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div className="saved-card-title">{job.title}</div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                            {typeof job.matchScore === 'number' && (
                              <span style={{
                                padding: '2px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                background: matchBg(job.matchScore), color: matchColor(job.matchScore),
                                whiteSpace: 'nowrap',
                              }}>
                                {job.matchScore}% match
                              </span>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleSaveJob(job) }}
                              disabled={savingJobId === job.id}
                              title={savedJobIds.has(job.id) ? 'Remove from saved' : 'Save job'}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: 18, padding: '2px 4px', lineHeight: 1,
                                opacity: savingJobId === job.id ? 0.5 : 1,
                                color: savedJobIds.has(job.id) ? 'var(--accent)' : 'var(--text-muted)',
                                transition: 'color 0.2s',
                              }}
                            >
                              {savedJobIds.has(job.id) ? '\u2605' : '\u2606'}
                            </button>
                          </div>
                        </div>
                        <div className="saved-card-meta">
                          {job.company} &middot; {job.location}
                          {job.isRemote && ' (Remote)'}
                          {job.salary && ` · ${job.salary}`}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                          {job.source} &middot; {timeSince(job.postedAt)}
                          {job.employmentType && ` · ${job.employmentType.replace('_', ' ')}`}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <h3 style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, color: 'var(--white)' }}>
                    {selectedJob.title}
                  </h3>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {typeof selectedJob.matchScore === 'number' && (
                      <span style={{
                        padding: '4px 14px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                        background: matchBg(selectedJob.matchScore), color: matchColor(selectedJob.matchScore),
                      }}>
                        {selectedJob.matchScore}%
                      </span>
                    )}
                    <button
                      onClick={() => toggleSaveJob(selectedJob)}
                      disabled={savingJobId === selectedJob.id}
                      style={{
                        background: savedJobIds.has(selectedJob.id) ? 'var(--accent)' : 'var(--surface)',
                        border: '1px solid var(--accent)', borderRadius: 8,
                        padding: '4px 12px', fontSize: 13, fontWeight: 600,
                        cursor: 'pointer',
                        color: savedJobIds.has(selectedJob.id) ? '#000' : 'var(--accent)',
                      }}
                    >
                      {savedJobIds.has(selectedJob.id) ? '\u2605 Saved' : '\u2606 Save'}
                    </button>
                  </div>
                </div>
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
                  <button
                    className="pro-export-btn"
                    style={{ display: 'inline-flex', alignItems: 'center' }}
                    onClick={() => navigate(`/onboard?jobTitle=${encodeURIComponent(selectedJob.title)}&company=${encodeURIComponent(selectedJob.company)}&jobDescription=${encodeURIComponent(selectedJob.description?.substring(0, 3000) || '')}`)}
                  >
                    &#10024; Tailor Resume
                  </button>
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
