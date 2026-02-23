import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, withTimeout } from '../lib/supabase'
import { useToast } from '../components/Toast'
import ResumeUploader from '../components/ResumeUploader'
import AuthModal from '../components/AuthModal'
import UpgradeModal from '../components/UpgradeModal'

type Step = 'upload' | 'review' | 'target' | 'customize' | 'generate' | 'result'

interface Experience {
  title: string
  company: string
  startDate: string
  endDate: string
  location: string
  bullets: string[]
}

interface Education {
  degree: string
  school: string
  year: string
  gpa: string | null
}

interface ParsedProfile {
  fullName: string
  email: string | null
  phone: string | null
  location: string | null
  summary: string | null
  experience: Experience[]
  education: Education[]
  skills: string[]
  certifications: string[]
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'review', label: 'Review' },
  { key: 'target', label: 'Target Job' },
  { key: 'customize', label: 'Customize' },
  { key: 'generate', label: 'Generate' },
]

const DAILY_LIMIT = 3

export default function Onboard() {
  const { user, session, isPro } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('upload')
  const [authOpen, setAuthOpen] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  // Profile data
  const [profile, setProfile] = useState<ParsedProfile>({
    fullName: '', email: null, phone: null, location: null, summary: null,
    experience: [], education: [], skills: [], certifications: [],
  })
  const [parsing, setParsing] = useState(false)
  const [existingProfile, setExistingProfile] = useState(false)

  // Target job fields
  const [jobTitle, setJobTitle] = useState('')
  const [company, setCompany] = useState('')
  const [industry, setIndustry] = useState('Technology')
  const [hasListing, setHasListing] = useState(false)
  const [jobDescription, setJobDescription] = useState('')

  // Customize fields
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [customSkill, setCustomSkill] = useState('')
  const [tone, setTone] = useState('Professional')
  const [highlights, setHighlights] = useState('')

  // Generate
  const [generating, setGenerating] = useState(false)
  const [resultContent, setResultContent] = useState('')
  const [exportLoading, setExportLoading] = useState(false)

  // Check for existing profile on mount
  useEffect(() => {
    if (!user) return
    loadExistingProfile()
  }, [user])

  const loadExistingProfile = async () => {
    if (!user) return
    try {
      const result = await withTimeout(
        Promise.resolve(
          supabase.from('user_profiles_extended').select('*').eq('user_id', user.id).single()
        ), 8000
      )
      if (result.data) {
        const d = result.data as any
        setProfile({
          fullName: d.full_name || '',
          email: d.email,
          phone: d.phone,
          location: d.location,
          summary: d.summary,
          experience: d.experience || [],
          education: d.education || [],
          skills: d.skills || [],
          certifications: d.certifications || [],
        })
        setSelectedSkills(d.skills || [])
        setExistingProfile(true)
        // If they already have a profile, skip to target step
        setStep('review')
      }
    } catch {}
  }

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    try {
      const { data: { session: s } } = await withTimeout(supabase.auth.getSession(), 5000)
      if (s) headers['Authorization'] = 'Bearer ' + s.access_token
    } catch {}
    return headers
  }

  // ---- STEP 1: Upload ----
  const handleResumeParsed = async (text: string) => {
    if (!user) {
      setAuthOpen(true)
      return
    }

    setParsing(true)
    try {
      const headers = await getAuthHeaders()

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const res = await fetch('/api/parse-resume', {
        method: 'POST',
        headers,
        body: JSON.stringify({ resumeText: text }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Parsing failed')

      setProfile(data.profile)
      setSelectedSkills(data.profile.skills || [])
      setStep('review')
      showToast('Resume parsed successfully!')
    } catch (err: any) {
      if (err.name === 'AbortError') {
        showToast('Parsing timed out. Please try again.')
      } else {
        showToast(err.message || 'Failed to parse resume')
      }
    } finally {
      setParsing(false)
    }
  }

  // ---- STEP 5: Generate ----
  const handleGenerate = async () => {
    if (!user) { setAuthOpen(true); return }

    // Check usage for free users
    if (!isPro) {
      try {
        const raw = localStorage.getItem('resumeai_usage')
        if (raw) {
          const data = JSON.parse(raw)
          if (data.date === new Date().toDateString() && data.count >= DAILY_LIMIT) {
            setUpgradeOpen(true)
            return
          }
        }
      } catch {}
    }

    setGenerating(true)
    setStep('generate')

    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'resume',
          jobTitle: jobTitle.trim(),
          company: company.trim(),
          jobDescription: jobDescription.trim(),
          experience: profile.experience.map(e =>
            `${e.title} at ${e.company} (${e.startDate} - ${e.endDate}): ${e.bullets.join('. ')}`
          ).join('\n'),
          skills: selectedSkills.join(', '),
          education: profile.education.map(e =>
            `${e.degree}, ${e.school} (${e.year})`
          ).join('; '),
          tone,
          industry,
          masterProfile: profile,
          highlights: highlights.trim(),
        }),
      })

      const data = await res.json()
      if (data.limitReached) { setUpgradeOpen(true); setStep('customize'); return }
      if (!res.ok || data.error) throw new Error(data.error || 'Generation failed')

      setResultContent(data.result)

      // Update usage
      const raw = localStorage.getItem('resumeai_usage')
      let count = 1
      if (raw) {
        const d = JSON.parse(raw)
        if (d.date === new Date().toDateString()) count = d.count + 1
      }
      localStorage.setItem('resumeai_usage', JSON.stringify({
        date: new Date().toDateString(), count,
      }))

      setStep('result')
    } catch (err: any) {
      showToast(err.message || 'Generation failed')
      setStep('customize')
    } finally {
      setGenerating(false)
    }
  }

  const copyResult = () => {
    navigator.clipboard.writeText(resultContent)
    showToast('Copied to clipboard!')
  }

  const saveResume = async () => {
    if (!user || !resultContent) return
    const title = company.trim() ? `${jobTitle.trim()} — ${company.trim()}` : jobTitle.trim()
    const { error } = await supabase.from('saved_resumes').insert({
      user_id: user.id, title: title || 'Resume', type: 'resume',
      content: resultContent, job_title: jobTitle.trim(), company: company.trim(),
    })
    showToast(error ? 'Failed to save' : 'Resume saved!')
  }

  const exportDocx = async () => {
    if (!isPro) { setUpgradeOpen(true); return }
    setExportLoading(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/export-docx', {
        method: 'POST', headers,
        body: JSON.stringify({ content: resultContent, title: jobTitle.trim() || 'Resume', type: 'resume' }),
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'resume.docx'; a.click()
      URL.revokeObjectURL(url)
      showToast('DOCX downloaded!')
    } catch (err: any) { showToast(err.message) }
    finally { setExportLoading(false) }
  }

  const exportPdf = async () => {
    if (!isPro) { setUpgradeOpen(true); return }
    setExportLoading(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/export-pdf', {
        method: 'POST', headers,
        body: JSON.stringify({ content: resultContent, title: jobTitle.trim() || 'Resume', type: 'resume' }),
      })
      if (!res.ok) throw new Error('Export failed')
      const data = await res.json()
      const w = window.open('', '_blank')
      if (w) { w.document.write(data.html); w.document.close() }
    } catch (err: any) { showToast(err.message) }
    finally { setExportLoading(false) }
  }

  const toggleSkill = (skill: string) => {
    setSelectedSkills(prev =>
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
    )
  }

  const addCustomSkill = () => {
    const s = customSkill.trim()
    if (s && !selectedSkills.includes(s)) {
      setSelectedSkills(prev => [...prev, s])
      setCustomSkill('')
    }
  }

  const stepIndex = STEPS.findIndex(s => s.key === step)

  return (
    <div className="app-container">
      <nav className="app-nav">
        <Link className="logo" to="/">
          <span className="logo-icon">&#9670;</span>
          <span className="logo-text">ResumeAI</span>
        </Link>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link to="/jobs" className="nav-link">Job Search</Link>
          <Link to="/tracker" className="nav-link">Tracker</Link>
          <Link to="/interview" className="nav-link">Interview Prep</Link>
        </div>
      </nav>

      {/* Progress Bar */}
      {step !== 'result' && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 32 }}>
          {STEPS.map((s, i) => (
            <div key={s.key} style={{ flex: 1 }}>
              <div style={{
                height: 4, borderRadius: 2,
                background: i <= stepIndex ? 'var(--accent)' : 'var(--border)',
                transition: 'background 0.3s ease',
              }} />
              <div style={{
                fontSize: 11, color: i <= stepIndex ? 'var(--accent)' : 'var(--text-muted)',
                marginTop: 6, textAlign: 'center', fontWeight: i === stepIndex ? 700 : 400,
              }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* STEP 1: Upload */}
      {step === 'upload' && (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
          <h2 className="form-title">Let's build your perfect resume</h2>
          <p className="form-sub">Upload your current resume and our AI will extract your information, or start fresh.</p>

          {!user && (
            <div style={{
              background: 'var(--accent-glow)', border: '1px solid var(--accent)',
              borderRadius: 12, padding: '16px 20px', marginBottom: 24,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 14, color: 'var(--text)' }}>Sign in to save your profile and generate resumes</span>
              <button className="btn-primary" onClick={() => setAuthOpen(true)} style={{ padding: '8px 20px', fontSize: 13 }}>
                Sign In
              </button>
            </div>
          )}

          <ResumeUploader onParsed={handleResumeParsed} loading={parsing} />

          <div style={{ textAlign: 'center', margin: '24px 0' }}>
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>or</span>
          </div>

          <button
            className="generate-btn"
            style={{ background: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
            onClick={() => {
              if (!user) { setAuthOpen(true); return }
              setStep('review')
            }}
          >
            Start From Scratch
          </button>
        </div>
      )}

      {/* STEP 2: Review Profile */}
      {step === 'review' && (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
          <h2 className="form-title">Review Your Profile</h2>
          <p className="form-sub">
            {existingProfile
              ? 'Welcome back! Here\'s your saved profile. Edit anything before continuing.'
              : 'Here\'s what we extracted. Edit anything that doesn\'t look right.'}
          </p>

          <div className="form-grid">
            <div className="form-group">
              <label className="label">Full Name</label>
              <input className="input" value={profile.fullName} onChange={e => setProfile(p => ({ ...p, fullName: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Email</label>
              <input className="input" value={profile.email || ''} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Phone</label>
              <input className="input" value={profile.phone || ''} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Location</label>
              <input className="input" placeholder="e.g. Austin, TX" value={profile.location || ''} onChange={e => setProfile(p => ({ ...p, location: e.target.value }))} />
            </div>
          </div>

          {/* Experience */}
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <label className="label" style={{ margin: 0 }}>Experience</label>
              <button style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setProfile(p => ({
                  ...p, experience: [...p.experience, { title: '', company: '', startDate: '', endDate: '', location: '', bullets: [''] }]
                }))}>
                + Add Position
              </button>
            </div>
            {profile.experience.map((exp, i) => (
              <div key={i} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, padding: 16, marginBottom: 12,
              }}>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="label" style={{ fontSize: 12 }}>Job Title</label>
                    <input className="input" value={exp.title} onChange={e => {
                      const updated = [...profile.experience]
                      updated[i] = { ...updated[i], title: e.target.value }
                      setProfile(p => ({ ...p, experience: updated }))
                    }} />
                  </div>
                  <div className="form-group">
                    <label className="label" style={{ fontSize: 12 }}>Company</label>
                    <input className="input" value={exp.company} onChange={e => {
                      const updated = [...profile.experience]
                      updated[i] = { ...updated[i], company: e.target.value }
                      setProfile(p => ({ ...p, experience: updated }))
                    }} />
                  </div>
                  <div className="form-group">
                    <label className="label" style={{ fontSize: 12 }}>Start Date</label>
                    <input className="input" value={exp.startDate} onChange={e => {
                      const updated = [...profile.experience]
                      updated[i] = { ...updated[i], startDate: e.target.value }
                      setProfile(p => ({ ...p, experience: updated }))
                    }} />
                  </div>
                  <div className="form-group">
                    <label className="label" style={{ fontSize: 12 }}>End Date</label>
                    <input className="input" placeholder="Present" value={exp.endDate} onChange={e => {
                      const updated = [...profile.experience]
                      updated[i] = { ...updated[i], endDate: e.target.value }
                      setProfile(p => ({ ...p, experience: updated }))
                    }} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="label" style={{ fontSize: 12 }}>Key Achievements (one per line)</label>
                  <textarea className="textarea" rows={3}
                    value={exp.bullets.join('\n')}
                    onChange={e => {
                      const updated = [...profile.experience]
                      updated[i] = { ...updated[i], bullets: e.target.value.split('\n') }
                      setProfile(p => ({ ...p, experience: updated }))
                    }} />
                </div>
              </div>
            ))}
          </div>

          {/* Skills */}
          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="label">Skills</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {profile.skills.map((skill, i) => (
                <span key={i} style={{
                  background: 'var(--accent-glow)', color: 'var(--accent)',
                  padding: '4px 12px', borderRadius: 8, fontSize: 13,
                  border: '1px solid var(--accent)',
                }}>
                  {skill}
                  <span style={{ cursor: 'pointer', marginLeft: 6, opacity: 0.7 }}
                    onClick={() => setProfile(p => ({ ...p, skills: p.skills.filter((_, j) => j !== i) }))}>
                    ×
                  </span>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" placeholder="Add a skill..." value={customSkill}
                onChange={e => setCustomSkill(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const s = customSkill.trim()
                    if (s && !profile.skills.includes(s)) {
                      setProfile(p => ({ ...p, skills: [...p.skills, s] }))
                      setCustomSkill('')
                    }
                  }
                }} />
            </div>
          </div>

          {/* Education */}
          <div style={{ marginTop: 16 }}>
            <label className="label">Education</label>
            {profile.education.map((edu, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <input className="input" style={{ flex: 2, minWidth: 180 }} placeholder="Degree" value={edu.degree}
                  onChange={e => {
                    const updated = [...profile.education]
                    updated[i] = { ...updated[i], degree: e.target.value }
                    setProfile(p => ({ ...p, education: updated }))
                  }} />
                <input className="input" style={{ flex: 2, minWidth: 180 }} placeholder="School" value={edu.school}
                  onChange={e => {
                    const updated = [...profile.education]
                    updated[i] = { ...updated[i], school: e.target.value }
                    setProfile(p => ({ ...p, education: updated }))
                  }} />
                <input className="input" style={{ flex: 1, minWidth: 80 }} placeholder="Year" value={edu.year}
                  onChange={e => {
                    const updated = [...profile.education]
                    updated[i] = { ...updated[i], year: e.target.value }
                    setProfile(p => ({ ...p, education: updated }))
                  }} />
              </div>
            ))}
            <button style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => setProfile(p => ({
                ...p, education: [...p.education, { degree: '', school: '', year: '', gpa: null }]
              }))}>
              + Add Education
            </button>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
            <button className="copy-btn" onClick={() => setStep('upload')}>&larr; Back</button>
            <button className="generate-btn" onClick={() => {
              setSelectedSkills(profile.skills)
              setStep('target')
            }}>
              Looks Good! Continue &rarr;
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Target Job */}
      {step === 'target' && (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
          <h2 className="form-title">What job are you targeting?</h2>
          <p className="form-sub">Tell us about the role so we can tailor your resume perfectly.</p>

          <div className="form-group">
            <label className="label">Job Title *</label>
            <input className="input" placeholder="e.g. Senior Product Manager" value={jobTitle} onChange={e => setJobTitle(e.target.value)} />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="label">Company (optional)</label>
              <input className="input" placeholder="e.g. Google" value={company} onChange={e => setCompany(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Industry</label>
              <select className="select" value={industry} onChange={e => setIndustry(e.target.value)}>
                <option>Technology</option><option>Finance</option><option>Healthcare</option>
                <option>Marketing</option><option>Education</option><option>Engineering</option>
                <option>Sales</option><option>Design</option><option>Legal</option><option>Other</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text)', cursor: 'pointer', marginBottom: 12 }}>
              <input type="checkbox" checked={hasListing} onChange={e => setHasListing(e.target.checked)} />
              I have a specific job listing
            </label>
            {hasListing && (
              <div className="form-group">
                <label className="label">Paste the Job Description</label>
                <textarea className="textarea" rows={6}
                  placeholder="Paste the full job description here for the best tailoring results..."
                  value={jobDescription} onChange={e => setJobDescription(e.target.value)} />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
            <button className="copy-btn" onClick={() => setStep('review')}>&larr; Back</button>
            <button className="generate-btn" onClick={() => {
              if (!jobTitle.trim()) { showToast('Please enter a job title'); return }
              setStep('customize')
            }}>
              Continue &rarr;
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Customize */}
      {step === 'customize' && (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
          <h2 className="form-title">Customize Your Resume</h2>
          <p className="form-sub">Choose which skills to highlight and set the tone for your {jobTitle} resume.</p>

          <div className="form-group">
            <label className="label">Skills to Emphasize (click to toggle)</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {profile.skills.map(skill => (
                <button key={skill} onClick={() => toggleSkill(skill)} style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 13, border: '1px solid',
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: selectedSkills.includes(skill) ? 'var(--accent)' : 'var(--surface)',
                  color: selectedSkills.includes(skill) ? '#000' : 'var(--text)',
                  borderColor: selectedSkills.includes(skill) ? 'var(--accent)' : 'var(--border)',
                }}>
                  {selectedSkills.includes(skill) ? '✓ ' : ''}{skill}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" placeholder="Add another skill..." value={customSkill}
                onChange={e => setCustomSkill(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomSkill()} />
              <button className="copy-btn" onClick={addCustomSkill}>Add</button>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 20 }}>
            <label className="label">Tone</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['Professional', 'Confident', 'Creative', 'Executive'].map(t => (
                <button key={t} onClick={() => setTone(t)} style={{
                  padding: '8px 18px', borderRadius: 10, fontSize: 14, border: '1px solid',
                  cursor: 'pointer',
                  background: tone === t ? 'var(--accent)' : 'var(--surface)',
                  color: tone === t ? '#000' : 'var(--text)',
                  borderColor: tone === t ? 'var(--accent)' : 'var(--border)',
                }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 20 }}>
            <label className="label">Anything specific to highlight? (optional)</label>
            <textarea className="textarea" rows={3}
              placeholder="e.g. Led a team of 15, increased revenue by 200%, built the product from 0 to 1M users..."
              value={highlights} onChange={e => setHighlights(e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
            <button className="copy-btn" onClick={() => setStep('target')}>&larr; Back</button>
            <button className="generate-btn" onClick={handleGenerate}>
              &#10024; Generate My Resume
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Generating */}
      {step === 'generate' && generating && (
        <div className="generating" style={{ animation: 'fadeIn 0.4s ease-out' }}>
          <div className="spinner"></div>
          <h2 className="generating-title">Crafting your tailored resume...</h2>
          <p className="generating-sub">
            Our AI is analyzing the job requirements and building your resume using our standard professional template.
          </p>
        </div>
      )}

      {/* RESULT */}
      {step === 'result' && (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
          <div className="result-header">
            <h2 className="result-title">&#128196; Your Tailored Resume</h2>
            <div className="result-actions">
              {user && <button className="save-btn" onClick={saveResume}>&#128190; Save</button>}
              <button className="copy-btn" onClick={copyResult}>&#128203; Copy</button>
              <button className="pro-export-btn" onClick={exportDocx} disabled={exportLoading}>
                &#11015; DOCX {!isPro && '(Pro)'}
              </button>
              <button className="pro-export-btn" onClick={exportPdf} disabled={exportLoading}>
                &#128196; PDF {!isPro && '(Pro)'}
              </button>
            </div>
          </div>

          <div className="result-box">
            <pre className="result-text">{resultContent}</pre>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
            <button className="generate-btn" onClick={() => setStep('customize')} style={{ flex: 1 }}>
              &#128260; Tweak &amp; Regenerate
            </button>
            <button className="generate-btn" onClick={() => navigate('/jobs')}
              style={{ flex: 1, background: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
              &#128269; Find Matching Jobs &rarr;
            </button>
          </div>

          <div className="retry-tip" style={{ marginTop: 16 }}>
            &#128161; <strong>Tip:</strong> Your profile is saved. When you find a job listing, come back and we'll tailor your resume specifically for that role.
          </div>
        </div>
      )}

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      <UpgradeModal isOpen={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  )
}
