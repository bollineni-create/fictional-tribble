import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, withTimeout, getValidSession } from '../lib/supabase'
import { useToast } from '../components/Toast'
import UpgradeModal from '../components/UpgradeModal'

const DAILY_LIMIT = 3

type ViewState = 'form' | 'generating' | 'result'

export default function ResumeBuilder() {
  const [searchParams] = useSearchParams()
  const { user, session, isPro } = useAuth()
  const { showToast } = useToast()

  // Tab state
  const [activeTab, setActiveTab] = useState<'resume' | 'coverLetter'>(
    (searchParams.get('tab') as any) === 'coverLetter' ? 'coverLetter' : 'resume'
  )

  // View state
  const [view, setView] = useState<ViewState>('form')

  // Form fields
  const [jobTitle, setJobTitle] = useState('')
  const [company, setCompany] = useState('')
  const [industry, setIndustry] = useState('Technology')
  const [tone, setTone] = useState('Professional')
  const [jobDescription, setJobDescription] = useState('')
  const [experience, setExperience] = useState('')
  const [skills, setSkills] = useState('')
  const [education, setEducation] = useState('')

  // Result
  const [resultContent, setResultContent] = useState('')
  const [error, setError] = useState('')

  // ATS Score
  const [atsScore, setAtsScore] = useState<any>(null)
  const [atsLoading, setAtsLoading] = useState(false)

  // Export loading
  const [exportLoading, setExportLoading] = useState(false)

  // Usage
  const [usageCount, setUsageCount] = useState(0)

  // Modals
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [showUpgradeSuccess, setShowUpgradeSuccess] = useState(false)

  // Check for upgrade return or upgrade param
  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    const upgrade = searchParams.get('upgrade')
    if (sessionId) {
      setShowUpgradeSuccess(true)
      setUpgradeOpen(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (upgrade === 'true') {
      setUpgradeOpen(true)
    }
  }, [searchParams])

  // Load usage from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('resumeai_usage')
      if (raw) {
        const data = JSON.parse(raw)
        if (data.date === new Date().toDateString()) {
          setUsageCount(data.count)
        }
      }
    } catch {}
  }, [])

  const remaining = DAILY_LIMIT - usageCount
  const usageDotClass = remaining > 1 ? 'green' : remaining === 1 ? 'yellow' : 'red'

  const saveUsage = (count: number) => {
    localStorage.setItem('resumeai_usage', JSON.stringify({
      date: new Date().toDateString(),
      count,
    }))
  }

  const getCharHint = (value: string, min: number) => {
    const len = value.trim().length
    if (len >= min) return { text: '\u2713 looks good!', className: 'char-hint met' }
    return { text: `(${min - len} more characters needed)`, className: 'char-hint' }
  }

  const expHint = getCharHint(experience, 50)
  const skillsHint = getCharHint(skills, 20)

  const handleGenerate = async () => {
    if (!isPro && usageCount >= DAILY_LIMIT) { setUpgradeOpen(true); return }

    if (!jobTitle.trim() || !experience.trim() || !skills.trim()) {
      setError('Please fill in the required fields (Job Title, Experience, Skills).')
      return
    }
    if (experience.trim().length < 50) {
      setError('Please add more detail to your Experience (at least 50 characters).')
      return
    }
    if (skills.trim().length < 20) {
      setError('Please add more skills (at least 20 characters).')
      return
    }

    setError('')
    setView('generating')

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      try {
        const s = await getValidSession()
        if (s) headers['Authorization'] = 'Bearer ' + s.access_token
      } catch {}

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: activeTab,
          jobTitle: jobTitle.trim(),
          company: company.trim(),
          jobDescription: jobDescription.trim(),
          experience: experience.trim(),
          skills: skills.trim(),
          education: education.trim(),
          tone,
          industry,
        }),
      })

      const data = await res.json()

      if (data.limitReached) {
        setView('form')
        setUpgradeOpen(true)
        return
      }

      if (!res.ok || data.error) throw new Error(data.error || 'Generation failed')

      setResultContent(data.result)

      if (typeof data.remaining === 'number') {
        const newCount = DAILY_LIMIT - data.remaining
        setUsageCount(newCount)
        saveUsage(newCount)
      } else {
        const newCount = usageCount + 1
        setUsageCount(newCount)
        saveUsage(newCount)
      }

      setView('result')
    } catch (err: any) {
      setView('form')
      setError(err.message || 'Something went wrong. Please try again.')
    }
  }

  const copyResult = () => {
    navigator.clipboard.writeText(resultContent)
    showToast('Copied to clipboard!')
  }

  const saveResume = async () => {
    if (!user) return
    if (!resultContent) return

    const title = company.trim() ? `${jobTitle.trim()} — ${company.trim()}` : jobTitle.trim()

    const { error: saveError } = await supabase.from('saved_resumes').insert({
      user_id: user.id,
      title: title || 'Untitled Resume',
      type: activeTab,
      content: resultContent,
      job_title: jobTitle.trim(),
      company: company.trim(),
    })

    showToast(saveError ? 'Failed to save. Please try again.' : 'Resume saved!')
  }

  // View a previously saved resume
  const viewSavedResume = (resume: any) => {
    setResultContent(resume.content)
    setActiveTab(resume.type === 'resume' ? 'resume' : 'coverLetter')
    setView('result')
  }

  const switchTab = (tab: 'resume' | 'coverLetter') => {
    setActiveTab(tab)
  }

  const exportDocx = async () => {
    if (!isPro) { setUpgradeOpen(true); return }
    setExportLoading(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      try {
        const s = await getValidSession()
        if (s) headers['Authorization'] = 'Bearer ' + s.access_token
      } catch {}

      const res = await fetch('/api/export-docx', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: resultContent,
          title: jobTitle.trim() || 'Resume',
          type: activeTab,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Export failed')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = activeTab === 'coverLetter' ? 'cover-letter.docx' : 'resume.docx'
      a.click()
      URL.revokeObjectURL(url)
      showToast('DOCX downloaded!')
    } catch (err: any) {
      showToast(err.message || 'Export failed')
    } finally {
      setExportLoading(false)
    }
  }

  const exportPdf = async () => {
    if (!isPro) { setUpgradeOpen(true); return }
    setExportLoading(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      try {
        const s = await getValidSession()
        if (s) headers['Authorization'] = 'Bearer ' + s.access_token
      } catch {}

      const res = await fetch('/api/export-pdf', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: resultContent,
          title: jobTitle.trim() || 'Resume',
          type: activeTab,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Export failed')
      }

      const data = await res.json()
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(data.html)
        printWindow.document.close()
      }
    } catch (err: any) {
      showToast(err.message || 'Export failed')
    } finally {
      setExportLoading(false)
    }
  }

  const checkAtsScore = async () => {
    if (!resultContent) return
    setAtsLoading(true)
    setAtsScore(null)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      try {
        const s = await getValidSession()
        if (s) headers['Authorization'] = 'Bearer ' + s.access_token
      } catch {}

      const res = await fetch('/api/ats-score', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          resumeContent: resultContent,
          jobDescription: jobDescription.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (data.limitReached) { setUpgradeOpen(true); return }
      if (!res.ok || data.error) throw new Error(data.error || 'Analysis failed')
      setAtsScore(data.analysis)
    } catch (err: any) {
      showToast(err.message || 'ATS check failed')
    } finally {
      setAtsLoading(false)
    }
  }

  const buttonText = () => {
    if (!isPro && remaining <= 0) return '\uD83D\uDD12 Upgrade to Pro for More'
    return activeTab === 'resume' ? '\u2726 Generate Resume' : '\u2726 Generate Cover Letter'
  }

  return (
    <div className="app-container">
      <nav className="app-nav">
        <Link className="logo" to="/">
          <span className="logo-icon">&#9670;</span>
          <span className="logo-text">ResumeAI</span>
        </Link>
        <div className="usage-badge">
          <span className={`usage-dot ${usageDotClass}`}></span>
          <span>{isPro ? 'Pro — Unlimited' : `${remaining} / ${DAILY_LIMIT} free today`}</span>
        </div>
      </nav>

      <div className="tabs">
        <button className={`tab${activeTab === 'resume' ? ' active' : ''}`} onClick={() => switchTab('resume')}>
          &#128196; Resume Builder
        </button>
        <button className={`tab${activeTab === 'coverLetter' ? ' active' : ''}`} onClick={() => switchTab('coverLetter')}>
          &#9993;&#65039; Cover Letter
        </button>
      </div>

      {/* FORM VIEW */}
      {view === 'form' && (
        <div className="form-container">
          <h2 className="form-title">{activeTab === 'resume' ? 'Build Your Resume' : 'Write Your Cover Letter'}</h2>
          <p className="form-sub">Fill in the details below and our AI will generate a tailored document for you.</p>

          {error && <div className="error-box">{error}</div>}

          <div className="form-grid">
            <div className="form-group">
              <label className="label">Job Title *</label>
              <input className="input" placeholder="e.g. Senior Product Manager" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Company</label>
              <input className="input" placeholder="e.g. Google" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Industry</label>
              <select className="select" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                <option>Technology</option><option>Finance</option><option>Healthcare</option>
                <option>Marketing</option><option>Education</option><option>Engineering</option>
                <option>Sales</option><option>Design</option><option>Legal</option><option>Other</option>
              </select>
            </div>
            <div className="form-group">
              <label className="label">Tone</label>
              <select className="select" value={tone} onChange={(e) => setTone(e.target.value)}>
                <option>Professional</option><option>Confident</option><option>Creative</option><option>Executive</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="label">Job Description</label>
            <textarea className="textarea" rows={4} placeholder="Paste the job description here for the best results..."
              value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">Your Experience * <span className={expHint.className}>{expHint.text}</span></label>
            <textarea className="textarea" rows={4}
              placeholder="Example: Worked as a Marketing Manager at Acme Corp for 3 years. Led a team of 5, increased social media engagement by 40%..."
              value={experience} onChange={(e) => setExperience(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">Key Skills * <span className={skillsHint.className}>{skillsHint.text}</span></label>
            <textarea className="textarea" rows={2}
              placeholder="Example: Project management, Python, SQL, data analysis, team leadership..."
              value={skills} onChange={(e) => setSkills(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">Education</label>
            <input className="input" placeholder="e.g. B.S. Computer Science, Stanford University, 2020"
              value={education} onChange={(e) => setEducation(e.target.value)} />
          </div>

          <button className="generate-btn" onClick={handleGenerate} disabled={!isPro && remaining <= 0}>
            {buttonText()}
          </button>
        </div>
      )}

      {/* GENERATING VIEW */}
      {view === 'generating' && (
        <div className="generating">
          <div className="spinner"></div>
          <h2 className="generating-title">
            Crafting your {activeTab === 'resume' ? 'resume' : 'cover letter'}...
          </h2>
          <p className="generating-sub">Our AI is analyzing the job requirements and tailoring your document.</p>
        </div>
      )}

      {/* RESULT VIEW */}
      {view === 'result' && (
        <div className="result-container">
          <div className="result-header">
            <h2 className="result-title">
              {activeTab === 'resume' ? '\uD83D\uDCC4 Your Tailored Resume' : '\u2709\uFE0F Your Cover Letter'}
            </h2>
            <div className="result-actions">
              {user && <button className="save-btn" onClick={saveResume}>&#128190; Save</button>}
              <button className="copy-btn" onClick={copyResult}>&#128203; Copy</button>
              <button className="pro-export-btn" onClick={exportDocx} disabled={exportLoading}>
                {exportLoading ? '...' : '&#11015; DOCX'} {!isPro && '(Pro)'}
              </button>
              <button className="pro-export-btn" onClick={exportPdf} disabled={exportLoading}>
                {exportLoading ? '...' : '&#128196;'} PDF {!isPro && '(Pro)'}
              </button>
            </div>
          </div>
          <div className="result-box">
            <pre className="result-text">{resultContent}</pre>
          </div>
          <div className="result-footer">
            <button className="start-over-btn" onClick={() => setView('form')}>&larr; Generate Another</button>
            <span className="result-note">
              {isPro ? 'Pro — Unlimited generations' : `${remaining} generation${remaining !== 1 ? 's' : ''} remaining today`}
            </span>
          </div>
          <button className="retry-btn" onClick={() => setView('form')}>&#128260; Not what you expected? Edit &amp; Try Again</button>
          <div className="retry-tip">
            &#128161; <strong>Tip:</strong> For the best results, include specific details — job titles, company names, years of experience, measurable achievements, and the actual job description from the posting.
          </div>

          {/* ATS Score Section */}
          <div style={{ marginTop: 24 }}>
            <button
              className="generate-btn"
              onClick={checkAtsScore}
              disabled={atsLoading}
              style={{ background: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
            >
              {atsLoading ? 'Analyzing...' : `&#127919; Check ATS Score${!isPro ? ' (1 free/day)' : ''}`}
            </button>

            {atsScore && (
              <div style={{ marginTop: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: atsScore.score >= 80 ? 'rgba(92, 184, 92, 0.15)' : atsScore.score >= 60 ? 'var(--accent-glow)' : 'rgba(212, 85, 74, 0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, fontWeight: 700,
                    color: atsScore.score >= 80 ? 'var(--green)' : atsScore.score >= 60 ? 'var(--accent)' : 'var(--error)',
                  }}>
                    {atsScore.score}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, color: 'var(--white)' }}>
                      ATS Compatibility Score
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{atsScore.summary}</div>
                  </div>
                </div>

                {/* Sub-scores */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'Keyword Match', score: atsScore.keywordMatch?.score },
                    { label: 'Formatting', score: atsScore.formatting?.score },
                    { label: 'Sections', score: atsScore.sections?.score },
                  ].map((item) => (
                    <div key={item.label} style={{
                      background: 'var(--bg)', borderRadius: 10, padding: '12px 16px',
                      border: '1px solid var(--border)',
                    }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{item.label}</div>
                      <div style={{
                        fontSize: 20, fontWeight: 700,
                        color: (item.score ?? 0) >= 80 ? 'var(--green)' : (item.score ?? 0) >= 60 ? 'var(--accent)' : 'var(--error)',
                      }}>
                        {item.score ?? 'N/A'}%
                      </div>
                    </div>
                  ))}
                </div>

                {/* Missing keywords */}
                {atsScore.keywordMatch?.missing?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>MISSING KEYWORDS</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {atsScore.keywordMatch.missing.map((kw: string) => (
                        <span key={kw} style={{
                          background: 'rgba(212, 85, 74, 0.1)', color: 'var(--error)',
                          padding: '3px 10px', borderRadius: 6, fontSize: 13,
                          border: '1px solid rgba(212, 85, 74, 0.2)',
                        }}>{kw}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Improvements */}
                {atsScore.improvements?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>SUGGESTIONS</div>
                    {atsScore.improvements.map((s: string, i: number) => (
                      <div key={i} style={{
                        fontSize: 14, color: 'var(--text)', padding: '6px 0',
                        borderBottom: i < atsScore.improvements.length - 1 ? '1px solid var(--border)' : 'none',
                      }}>
                        &#8226; {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <UpgradeModal isOpen={upgradeOpen} onClose={() => { setUpgradeOpen(false); setShowUpgradeSuccess(false) }} showSuccess={showUpgradeSuccess} />
    </div>
  )
}
