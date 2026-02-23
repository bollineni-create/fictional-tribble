import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, withTimeout } from '../lib/supabase'
import { useToast } from '../components/Toast'
import ResumeUploader from '../components/ResumeUploader'
import AuthModal from '../components/AuthModal'
import UpgradeModal from '../components/UpgradeModal'

type Step = 'upload' | 'review' | 'target' | 'customize' | 'generate' | 'result'

type SectionCategory = 'professional' | 'leadership' | 'publication' | 'project' | 'honor' | 'certification'

const SECTION_LABELS: Record<SectionCategory, string> = {
  professional: 'Professional Experience',
  leadership: 'Leadership Experience',
  publication: 'Publications',
  project: 'Projects',
  honor: 'Honors & Awards',
  certification: 'Certifications',
}

interface Experience {
  category: SectionCategory
  title: string
  company: string
  startDate: string
  endDate: string
  location: string
  bullets: string[]
  // Publication fields
  authors?: string
  journal?: string
  doi?: string
  // Project fields
  description?: string
  technologies?: string
  url?: string
  // Honor/Award fields
  issuer?: string
  dateReceived?: string
  // Certification fields
  certOrg?: string
  certDate?: string
  certFileName?: string
  certFileUrl?: string
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
  linkedin: string | null
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
    fullName: '', email: null, phone: null, location: null, linkedin: null, summary: null,
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

  // AI bullet enhancement tracking: "expIdx-bulletIdx"
  const [enhancingBullet, setEnhancingBullet] = useState<string | null>(null)

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
          linkedin: d.linkedin || null,
          summary: d.summary,
          experience: (d.experience || []).map((e: any) => ({ ...e, category: e.category || 'professional' })),
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
      // Try refreshing the session first to avoid expired token errors
      const { data: { session: s } } = await withTimeout(supabase.auth.refreshSession(), 5000)
      if (s) {
        headers['Authorization'] = 'Bearer ' + s.access_token
      } else {
        // Fall back to existing session if refresh fails
        const { data: { session: existing } } = await supabase.auth.getSession()
        if (existing) headers['Authorization'] = 'Bearer ' + existing.access_token
      }
    } catch {}
    return headers
  }

  // ---- AI BULLET ENHANCEMENT ----
  const enhanceBullet = async (expIdx: number, bulletIdx: number) => {
    const key = `${expIdx}-${bulletIdx}`
    const exp = profile.experience[expIdx]
    const bullet = exp.bullets[bulletIdx]
    if (!bullet?.trim()) return

    setEnhancingBullet(key)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/enhance-bullet', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          bullet: bullet.trim(),
          jobTitle: exp.title,
          company: exp.company,
          targetRole: jobTitle.trim() || undefined,
          allBullets: (exp.bullets || []).filter(Boolean),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Enhancement failed')
      }
      const data = await res.json()
      if (data.enhanced) {
        const updated = [...profile.experience]
        const newBullets = [...updated[expIdx].bullets]
        newBullets[bulletIdx] = data.enhanced
        updated[expIdx] = { ...updated[expIdx], bullets: newBullets }
        setProfile(p => ({ ...p, experience: updated }))
      }
    } catch (err: any) {
      showToast(err.message || 'Could not enhance bullet')
    } finally {
      setEnhancingBullet(null)
    }
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
      // 45s client-side timeout (server has 30s, plus network overhead)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 45000)
      let res: Response
      try {
        res = await fetch('/api/parse-resume', {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({ resumeText: text }),
        })
      } catch (fetchErr: any) {
        clearTimeout(timeout)
        if (fetchErr.name === 'AbortError') throw new Error('Resume parsing timed out. Please try again.')
        throw fetchErr
      } finally {
        clearTimeout(timeout)
      }

      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Parsing failed')

      // Ensure all parsed experiences have a default category
      const parsedProfile = {
        ...data.profile,
        experience: (data.profile.experience || []).map((e: any) => ({ ...e, category: e.category || 'professional' })),
      }
      setProfile(parsedProfile)
      setSelectedSkills(data.profile.skills || [])

      // Auto-save the parsed resume to saved_resumes
      try {
        await supabase.from('saved_resumes').insert({
          user_id: user.id,
          title: data.profile.fullName ? `${data.profile.fullName}'s Resume` : 'Uploaded Resume',
          type: 'resume',
          content: text,
          job_title: 'General',
          company: '',
        })
      } catch {}

      // Also update the profiles table with the user's full name
      if (data.profile.fullName) {
        try {
          await supabase.from('profiles').update({ full_name: data.profile.fullName }).eq('id', user.id)
        } catch {}
      }

      setStep('review')
      showToast('Resume parsed and saved!')
    } catch (err: any) {
      showToast(err.message || 'Failed to parse resume')
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
          experience: profile.experience
            .filter(e => e.category === 'professional' || e.category === 'leadership')
            .map(e => `${e.title} at ${e.company} (${e.startDate} - ${e.endDate}): ${(e.bullets || []).filter(Boolean).join('. ')}`)
            .join('\n'),
          publications: profile.experience
            .filter(e => e.category === 'publication')
            .map(e => `${e.title}${e.authors ? `, ${e.authors}` : ''}${e.journal ? `, ${e.journal}` : ''}${e.startDate ? ` (${e.startDate})` : ''}`)
            .join('\n'),
          projects: profile.experience
            .filter(e => e.category === 'project')
            .map(e => `${e.title}${e.technologies ? ` [${e.technologies}]` : ''}${e.description ? `: ${e.description}` : ''}`)
            .join('\n'),
          honors: profile.experience
            .filter(e => e.category === 'honor')
            .map(e => `${e.title}${e.issuer ? `, ${e.issuer}` : ''}${e.dateReceived ? ` (${e.dateReceived})` : ''}`)
            .join('\n'),
          certificationsList: profile.experience
            .filter(e => e.category === 'certification')
            .map(e => `${e.title}${e.certOrg ? `, ${e.certOrg}` : ''}${e.certDate ? ` (${e.certDate})` : ''}`)
            .join('\n'),
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
              <label className="label">LinkedIn URL</label>
              <input className="input" placeholder="e.g. linkedin.com/in/yourname" value={profile.linkedin || ''} onChange={e => setProfile(p => ({ ...p, linkedin: e.target.value }))} />
            </div>
          </div>

          {/* Experience */}
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <label className="label" style={{ margin: 0 }}>Experience</label>
              <button style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setProfile(p => ({
                  ...p, experience: [...p.experience, { category: 'professional', title: '', company: '', startDate: '', endDate: '', location: '', bullets: ['', '', ''] }]
                }))}>
                + Add Entry
              </button>
            </div>
            {profile.experience.map((exp, i) => {
              const cat = exp.category || 'professional'
              const updateExp = (fields: Partial<Experience>) => {
                const updated = [...profile.experience]
                updated[i] = { ...updated[i], ...fields }
                setProfile(p => ({ ...p, experience: updated }))
              }
              const removeExp = () => {
                setProfile(p => ({ ...p, experience: p.experience.filter((_, j) => j !== i) }))
              }
              const hasBullets = cat === 'professional' || cat === 'leadership'
              const hasDates = cat === 'professional' || cat === 'leadership' || cat === 'project'
              return (
                <div key={i} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: 16, marginBottom: 12,
                }}>
                  {/* Category selector + remove button */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <select className="select" value={cat} onChange={e => updateExp({ category: e.target.value as SectionCategory })}
                      style={{ width: 'auto', fontSize: 13, padding: '4px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}>
                      {(Object.keys(SECTION_LABELS) as SectionCategory[]).map(k => (
                        <option key={k} value={k}>{SECTION_LABELS[k]}</option>
                      ))}
                    </select>
                    <button onClick={removeExp} style={{ fontSize: 12, color: '#e55', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Remove
                    </button>
                  </div>

                  {/* ---- Professional Experience / Leadership ---- */}
                  {(cat === 'professional' || cat === 'leadership') && (
                    <>
                      <div className="form-grid">
                        <div className="form-group">
                          <label className="label" style={{ fontSize: 12 }}>{cat === 'leadership' ? 'Role / Title' : 'Job Title'}</label>
                          <input className="input" value={exp.title} onChange={e => updateExp({ title: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="label" style={{ fontSize: 12 }}>{cat === 'leadership' ? 'Organization' : 'Company'}</label>
                          <input className="input" value={exp.company} onChange={e => updateExp({ company: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="label" style={{ fontSize: 12 }}>Start Date</label>
                          <input className="input" type="month" value={exp.startDate} onChange={e => updateExp({ startDate: e.target.value })} style={{ colorScheme: 'dark' }} />
                        </div>
                        <div className="form-group">
                          <label className="label" style={{ fontSize: 12 }}>End Date</label>
                          <input className="input" type="month" placeholder="Present" value={exp.endDate === 'Present' ? '' : exp.endDate} onChange={e => updateExp({ endDate: e.target.value })} style={{ colorScheme: 'dark' }} disabled={exp.endDate === 'Present'} />
                          <label style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                            <input type="checkbox" checked={exp.endDate === 'Present'} onChange={e => updateExp({ endDate: e.target.checked ? 'Present' : '' })} style={{ accentColor: 'var(--accent)' }} />
                            Current role
                          </label>
                        </div>
                      </div>
                      {/* Key Achievements — 3 separate lines with inline AI enhance + clear */}
                      <div className="form-group" style={{ marginTop: 8 }}>
                        <label className="label" style={{ fontSize: 12 }}>Key Achievements</label>
                        {[0, 1, 2].map(bulletIdx => {
                          const bulletKey = `${i}-${bulletIdx}`
                          const isEnhancing = enhancingBullet === bulletKey
                          const bulletVal = (exp.bullets && exp.bullets[bulletIdx]) || ''
                          return (
                            <div key={bulletIdx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ color: 'var(--text-muted)', fontSize: 13, minWidth: 16 }}>{bulletIdx + 1}.</span>
                              <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <input className="input" style={{ flex: 1, paddingRight: bulletVal.trim() ? 130 : 8 }}
                                  placeholder={bulletIdx === 0 ? 'e.g. Increased revenue by 20% through...' : 'Another key achievement...'}
                                  value={bulletVal}
                                  onChange={e => {
                                    const newBullets = [...(exp.bullets || ['', '', ''])]
                                    while (newBullets.length < 3) newBullets.push('')
                                    newBullets[bulletIdx] = e.target.value
                                    updateExp({ bullets: newBullets })
                                  }}
                                />
                                {/* Inline buttons — inside the input visually */}
                                {bulletVal.trim() && (
                                  <div style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <button
                                      disabled={isEnhancing}
                                      onClick={() => enhanceBullet(i, bulletIdx)}
                                      style={{
                                        background: isEnhancing ? 'transparent' : 'linear-gradient(135deg, var(--accent), #b8944f)',
                                        color: isEnhancing ? 'var(--accent)' : '#fff',
                                        border: isEnhancing ? '1px solid var(--accent)' : 'none',
                                        borderRadius: 6, padding: '3px 10px',
                                        fontSize: 10, fontWeight: 600, cursor: isEnhancing ? 'wait' : 'pointer',
                                        whiteSpace: 'nowrap', transition: 'all 0.2s', lineHeight: '18px',
                                      }}
                                      title="Use AI to improve this bullet point"
                                    >
                                      {isEnhancing ? '...' : '✦ AI'}
                                    </button>
                                    <button
                                      onClick={() => {
                                        const newBullets = [...(exp.bullets || ['', '', ''])]
                                        while (newBullets.length < 3) newBullets.push('')
                                        newBullets[bulletIdx] = ''
                                        updateExp({ bullets: newBullets })
                                      }}
                                      style={{
                                        background: 'transparent', color: 'var(--text-muted)',
                                        border: 'none', borderRadius: 6, padding: '3px 6px',
                                        fontSize: 14, cursor: 'pointer', lineHeight: '18px',
                                        transition: 'color 0.15s',
                                      }}
                                      title="Clear this bullet"
                                      onMouseEnter={e => (e.currentTarget.style.color = '#e55')}
                                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                                    >
                                      ×
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}

                  {/* ---- Publication ---- */}
                  {cat === 'publication' && (
                    <div className="form-grid">
                      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label className="label" style={{ fontSize: 12 }}>Publication Title</label>
                        <input className="input" placeholder="Title of your publication" value={exp.title} onChange={e => updateExp({ title: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="label" style={{ fontSize: 12 }}>Authors</label>
                        <input className="input" placeholder="e.g. Smith, J., Doe, A." value={exp.authors || ''} onChange={e => updateExp({ authors: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="label" style={{ fontSize: 12 }}>Journal / Publication</label>
                        <input className="input" placeholder="e.g. Nature, IEEE..." value={exp.journal || ''} onChange={e => updateExp({ journal: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="label" style={{ fontSize: 12 }}>Year</label>
                        <input className="input" placeholder="2025" value={exp.startDate} onChange={e => updateExp({ startDate: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="label" style={{ fontSize: 12 }}>DOI / URL</label>
                        <input className="input" placeholder="https://doi.org/..." value={exp.doi || ''} onChange={e => updateExp({ doi: e.target.value })} />
                      </div>
                    </div>
                  )}

                  {/* ---- Project ---- */}
                  {cat === 'project' && (
                    <>
                      <div className="form-grid">
                        <div className="form-group">
                          <label className="label" style={{ fontSize: 12 }}>Project Name</label>
                          <input className="input" value={exp.title} onChange={e => updateExp({ title: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="label" style={{ fontSize: 12 }}>Technologies Used</label>
                          <input className="input" placeholder="e.g. React, Python, AWS" value={exp.technologies || ''} onChange={e => updateExp({ technologies: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="label" style={{ fontSize: 12 }}>Start Date</label>
                          <input className="input" type="month" value={exp.startDate} onChange={e => updateExp({ startDate: e.target.value })} style={{ colorScheme: 'dark' }} />
                        </div>
                        <div className="form-group">
                          <label className="label" style={{ fontSize: 12 }}>URL (optional)</label>
                          <input className="input" placeholder="https://..." value={exp.url || ''} onChange={e => updateExp({ url: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-group" style={{ marginTop: 8 }}>
                        <label className="label" style={{ fontSize: 12 }}>Description</label>
                        <textarea className="textarea" rows={2} placeholder="Brief description of the project and your role..."
                          value={exp.description || ''} onChange={e => updateExp({ description: e.target.value })} />
                      </div>
                    </>
                  )}

                  {/* ---- Honor / Award ---- */}
                  {cat === 'honor' && (
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="label" style={{ fontSize: 12 }}>Award Name</label>
                        <input className="input" placeholder="e.g. Dean's List, Employee of the Year" value={exp.title} onChange={e => updateExp({ title: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="label" style={{ fontSize: 12 }}>Issuer / Organization</label>
                        <input className="input" placeholder="e.g. University of Texas" value={exp.issuer || ''} onChange={e => updateExp({ issuer: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="label" style={{ fontSize: 12 }}>Date Received</label>
                        <input className="input" type="month" value={exp.dateReceived || ''} onChange={e => updateExp({ dateReceived: e.target.value })} style={{ colorScheme: 'dark' }} />
                      </div>
                    </div>
                  )}

                  {/* ---- Certification ---- */}
                  {cat === 'certification' && (
                    <>
                      <div className="form-grid">
                        <div className="form-group">
                          <label className="label" style={{ fontSize: 12 }}>Certification Name</label>
                          <input className="input" placeholder="e.g. AWS Solutions Architect" value={exp.title} onChange={e => updateExp({ title: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="label" style={{ fontSize: 12 }}>Issuing Organization</label>
                          <input className="input" placeholder="e.g. Amazon Web Services" value={exp.certOrg || ''} onChange={e => updateExp({ certOrg: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="label" style={{ fontSize: 12 }}>Date Obtained</label>
                          <input className="input" type="month" value={exp.certDate || ''} onChange={e => updateExp({ certDate: e.target.value })} style={{ colorScheme: 'dark' }} />
                        </div>
                      </div>
                      {/* Certificate file upload */}
                      <div className="form-group" style={{ marginTop: 8 }}>
                        <label className="label" style={{ fontSize: 12 }}>Upload Certificate (optional)</label>
                        {exp.certFileName ? (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: 'var(--bg)', border: '1px solid var(--border)',
                            borderRadius: 8, padding: '8px 12px',
                          }}>
                            <span style={{ fontSize: 16 }}>📄</span>
                            <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {exp.certFileName}
                            </span>
                            {exp.certFileUrl && (
                              <a href={exp.certFileUrl} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                View
                              </a>
                            )}
                            <button onClick={() => updateExp({ certFileName: undefined, certFileUrl: undefined })}
                              style={{ background: 'none', border: 'none', color: '#e55', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>
                              ×
                            </button>
                          </div>
                        ) : (
                          <label style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            background: 'var(--bg)', border: '1px dashed var(--border)',
                            borderRadius: 8, padding: '10px 16px', cursor: 'pointer',
                            fontSize: 13, color: 'var(--text-muted)', transition: 'border-color 0.2s',
                          }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                          >
                            <span>📎 Upload PDF, PNG, or JPG</span>
                            <input type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }}
                              onChange={async (e) => {
                                const file = e.target.files?.[0]
                                if (!file) return
                                if (file.size > 5 * 1024 * 1024) {
                                  showToast('File must be under 5MB')
                                  return
                                }
                                // Store as data URL for now (persists in profile state)
                                const reader = new FileReader()
                                reader.onload = () => {
                                  updateExp({ certFileName: file.name, certFileUrl: reader.result as string })
                                  showToast('Certificate uploaded!')
                                }
                                reader.readAsDataURL(file)
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
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
            <button className="generate-btn" onClick={() => {
              // Also save the generated result automatically
              if (user && resultContent) {
                const title = company.trim() ? `${jobTitle.trim()} — ${company.trim()}` : jobTitle.trim()
                supabase.from('saved_resumes').insert({
                  user_id: user.id, title: title || 'Resume', type: 'resume',
                  content: resultContent, job_title: jobTitle.trim(), company: company.trim(),
                }).then(() => {})
              }
              // Navigate to jobs with pre-filled search query
              const searchQuery = jobTitle.trim()
              navigate(searchQuery ? `/jobs?q=${encodeURIComponent(searchQuery)}` : '/jobs')
            }}
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
