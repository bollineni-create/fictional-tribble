import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, withTimeout } from '../lib/supabase'
import { useToast } from '../components/Toast'
import UpgradeModal from '../components/UpgradeModal'

interface PrepResult {
  companyBrief: { overview: string; culture: string; recentNews: string }
  behavioralQuestions: Array<{ question: string; framework: string; sampleAnswer: string }>
  technicalQuestions: Array<{ question: string; keyPoints: string; difficulty: string }>
  questionsToAsk: Array<{ question: string; why: string }>
  interviewFormat: { expectedRounds: string; tips: string[]; commonMistakes: string[] }
  salaryNegotiation: { range: string; tips: string[] }
}

export default function InterviewPrep() {
  const { user, isPro } = useAuth()
  const { showToast } = useToast()
  const [searchParams] = useSearchParams()

  const [jobTitle, setJobTitle] = useState(searchParams.get('jobTitle') || '')
  const [company, setCompany] = useState(searchParams.get('company') || '')
  const [jobDescription, setJobDescription] = useState(searchParams.get('jobDescription') || '')

  // Auto-generate if pre-filled from inbox or job search
  useEffect(() => {
    if (searchParams.get('auto') === 'true' && jobTitle) {
      generatePrep()
    }
  }, [])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PrepResult | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('company')

  const getAuthHeaders = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    try {
      const { data: { session } } = await withTimeout(supabase.auth.getSession(), 5000)
      if (session) headers['Authorization'] = 'Bearer ' + session.access_token
    } catch {}
    return headers
  }

  const generatePrep = async () => {
    if (!jobTitle.trim()) { showToast('Job title is required'); return }
    setLoading(true)
    setResult(null)

    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/interview-prep', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jobTitle: jobTitle.trim(),
          company: company.trim() || undefined,
          jobDescription: jobDescription.trim() || undefined,
          mode: 'full',
        }),
      })

      const data = await res.json()
      if (data.limitReached) { setUpgradeOpen(true); setLoading(false); return }
      if (!res.ok || data.error) throw new Error(data.error || 'Generation failed')
      setResult(data.result)
    } catch (err: any) {
      showToast(err.message || 'Failed to generate prep materials')
    } finally {
      setLoading(false)
    }
  }

  const sections = [
    { key: 'company', label: '&#127970; Company Brief' },
    { key: 'behavioral', label: '&#128172; Behavioral' },
    { key: 'technical', label: '&#128187; Technical' },
    { key: 'ask', label: '&#10067; Questions to Ask' },
    { key: 'format', label: '&#128203; Format & Tips' },
    { key: 'salary', label: '&#128176; Salary' },
  ]

  return (
    <div className="app-container" style={{ maxWidth: 960 }}>
      <nav className="app-nav">
        <Link className="logo" to="/"><span className="logo-icon">&#9670;</span><span className="logo-text">ResumeAI</span></Link>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link to="/app" className="nav-link">Resume Builder</Link>
          <Link to="/jobs" className="nav-link">Job Search</Link>
          <Link to="/tracker" className="nav-link">Tracker</Link>
          <Link to="/interview" className="nav-link" style={{ color: 'var(--accent)' }}>Interview Prep</Link>
        </div>
      </nav>

      <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
        <h2 className="form-title" style={{ marginTop: 8 }}>&#127891; Interview Prep</h2>
        <p className="form-sub">AI-generated interview preparation with company research, question banks, and tips.{!isPro && ' (1 free/day)'}</p>

        {/* Input Form */}
        {!result && !loading && (
          <div>
            <div className="form-grid">
              <div className="form-group">
                <label className="label">Job Title *</label>
                <input className="input" placeholder="e.g. Senior Software Engineer" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="label">Company</label>
                <input className="input" placeholder="e.g. Google" value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="label">Job Description (optional but recommended)</label>
              <textarea className="textarea" rows={4} placeholder="Paste the job description for personalized questions..."
                value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
            </div>
            <button className="generate-btn" onClick={generatePrep}>
              &#127891; Generate Interview Prep
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="generating" style={{ padding: '60px 0' }}>
            <div className="spinner"></div>
            <h2 className="generating-title">Preparing your interview materials...</h2>
            <p className="generating-sub">Researching the company, crafting questions, and building your prep kit.</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                Prep for: <strong style={{ color: 'var(--white)' }}>{jobTitle}</strong>
                {company && <> at <strong style={{ color: 'var(--white)' }}>{company}</strong></>}
              </div>
              <button className="start-over-btn" onClick={() => setResult(null)}>&larr; New Prep</button>
            </div>

            {/* Section Tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
              {sections.map((s) => (
                <button
                  key={s.key}
                  className={`tab${activeSection === s.key ? ' active' : ''}`}
                  style={{ flex: 'none', padding: '8px 14px', fontSize: 13 }}
                  onClick={() => setActiveSection(s.key)}
                  dangerouslySetInnerHTML={{ __html: s.label }}
                />
              ))}
            </div>

            {/* Company Brief */}
            {activeSection === 'company' && result.companyBrief && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { label: 'Company Overview', content: result.companyBrief.overview },
                  { label: 'Culture & Values', content: result.companyBrief.culture },
                  { label: 'Things to Research', content: result.companyBrief.recentNews },
                ].map((item) => (
                  <div key={item.label} className="saved-card" style={{ cursor: 'default' }}>
                    <div className="saved-card-title">{item.label}</div>
                    <p style={{ fontSize: 14, color: 'var(--text)', marginTop: 8, lineHeight: 1.6 }}>{item.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Behavioral Questions */}
            {activeSection === 'behavioral' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {result.behavioralQuestions?.map((q, i) => (
                  <div key={i} className="saved-card" style={{ cursor: 'default' }}>
                    <div className="saved-card-title">Q{i + 1}: {q.question}</div>
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 4 }}>ANSWER FRAMEWORK</div>
                      <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{q.framework}</p>
                    </div>
                    {q.sampleAnswer && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>SAMPLE APPROACH</div>
                        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>{q.sampleAnswer}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Technical Questions */}
            {activeSection === 'technical' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {result.technicalQuestions?.map((q, i) => (
                  <div key={i} className="saved-card" style={{ cursor: 'default' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div className="saved-card-title">Q{i + 1}: {q.question}</div>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 6,
                        background: q.difficulty === 'hard' ? 'rgba(212,85,74,0.15)' : q.difficulty === 'medium' ? 'var(--accent-glow)' : 'rgba(92,184,92,0.15)',
                        color: q.difficulty === 'hard' ? 'var(--error)' : q.difficulty === 'medium' ? 'var(--accent)' : 'var(--green)',
                      }}>{q.difficulty}</span>
                    </div>
                    <p style={{ fontSize: 14, color: 'var(--text)', marginTop: 8, lineHeight: 1.6 }}>{q.keyPoints}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Questions to Ask */}
            {activeSection === 'ask' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {result.questionsToAsk?.map((q, i) => (
                  <div key={i} className="saved-card" style={{ cursor: 'default' }}>
                    <div className="saved-card-title">{q.question}</div>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>{q.why}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Format & Tips */}
            {activeSection === 'format' && result.interviewFormat && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="saved-card" style={{ cursor: 'default' }}>
                  <div className="saved-card-title">Expected Interview Format</div>
                  <p style={{ fontSize: 14, color: 'var(--text)', marginTop: 8 }}>{result.interviewFormat.expectedRounds}</p>
                </div>
                <div className="saved-card" style={{ cursor: 'default' }}>
                  <div className="saved-card-title">Tips for Success</div>
                  {result.interviewFormat.tips?.map((tip, i) => (
                    <p key={i} style={{ fontSize: 14, color: 'var(--text)', padding: '6px 0', borderBottom: i < result.interviewFormat.tips.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      &#10003; {tip}
                    </p>
                  ))}
                </div>
                <div className="saved-card" style={{ cursor: 'default' }}>
                  <div className="saved-card-title" style={{ color: 'var(--error)' }}>Common Mistakes to Avoid</div>
                  {result.interviewFormat.commonMistakes?.map((m, i) => (
                    <p key={i} style={{ fontSize: 14, color: 'var(--text)', padding: '6px 0' }}>&#10060; {m}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Salary */}
            {activeSection === 'salary' && result.salaryNegotiation && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {result.salaryNegotiation.range && (
                  <div className="saved-card" style={{ cursor: 'default' }}>
                    <div className="saved-card-title">Expected Salary Range</div>
                    <p style={{ fontSize: 18, color: 'var(--accent)', marginTop: 8, fontWeight: 700 }}>{result.salaryNegotiation.range}</p>
                  </div>
                )}
                <div className="saved-card" style={{ cursor: 'default' }}>
                  <div className="saved-card-title">Negotiation Tips</div>
                  {result.salaryNegotiation.tips?.map((tip, i) => (
                    <p key={i} style={{ fontSize: 14, color: 'var(--text)', padding: '6px 0', borderBottom: i < result.salaryNegotiation.tips.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      &#128161; {tip}
                    </p>
                  ))}
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
