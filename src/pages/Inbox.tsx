import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, withTimeout } from '../lib/supabase'
import { useToast } from '../components/Toast'
import AuthModal from '../components/AuthModal'

interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  from_address: string
  to_address: string
  subject: string
  body_text: string
  body_html: string
  is_read: boolean
  application_id: string | null
  created_at: string
}

export default function Inbox() {
  const { user, session } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [authOpen, setAuthOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMsg, setSelectedMsg] = useState<Message | null>(null)
  const [dedicatedEmail, setDedicatedEmail] = useState('')
  const [provisioning, setProvisioning] = useState(false)

  // Reply state
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyTo, setReplyTo] = useState('')
  const [replySubject, setReplySubject] = useState('')
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (user) {
      loadEmail()
      loadMessages()
    } else {
      setLoading(false)
    }
  }, [user])

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    try {
      const { data: { session: s } } = await withTimeout(supabase.auth.getSession(), 5000)
      if (s) headers['Authorization'] = 'Bearer ' + s.access_token
    } catch {}
    return headers
  }

  const loadEmail = async () => {
    if (!user) return
    try {
      const result = await withTimeout(
        Promise.resolve(
          supabase.from('user_emails').select('email_address').eq('user_id', user.id).single()
        ), 8000
      )
      if (result.data) {
        setDedicatedEmail((result.data as any).email_address)
      }
    } catch {}
  }

  const provisionEmail = async () => {
    setProvisioning(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/provision-email', { method: 'POST', headers })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed')
      setDedicatedEmail(data.email)
      showToast('Email address created!')
    } catch (err: any) {
      showToast(err.message || 'Failed to create email')
    } finally {
      setProvisioning(false)
    }
  }

  const loadMessages = async () => {
    if (!user) return
    setLoading(true)
    try {
      const result = await withTimeout(
        Promise.resolve(
          supabase.from('messages').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)
        ), 10000
      )
      if (result.data) setMessages(result.data as Message[])
    } catch {}
    finally { setLoading(false) }
  }

  const markRead = async (msg: Message) => {
    if (msg.is_read) return
    await supabase.from('messages').update({ is_read: true }).eq('id', msg.id)
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m))
  }

  const selectMessage = (msg: Message) => {
    setSelectedMsg(msg)
    markRead(msg)
    setReplyOpen(false)
  }

  const startReply = () => {
    if (!selectedMsg) return
    setReplyTo(selectedMsg.direction === 'inbound' ? selectedMsg.from_address : selectedMsg.to_address)
    setReplySubject(selectedMsg.subject.startsWith('Re:') ? selectedMsg.subject : `Re: ${selectedMsg.subject}`)
    setReplyBody('')
    setReplyOpen(true)
  }

  const sendReply = async () => {
    if (!replyTo || !replyBody.trim()) return
    setSending(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/send-email', {
        method: 'POST', headers,
        body: JSON.stringify({
          to: replyTo,
          subject: replySubject,
          body: replyBody.trim(),
          replyToMessageId: selectedMsg?.id,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Send failed')
      showToast('Email sent!')
      setReplyOpen(false)
      loadMessages()
    } catch (err: any) {
      showToast(err.message || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const unreadCount = messages.filter(m => !m.is_read && m.direction === 'inbound').length
  const timeFmt = (d: string) => {
    const date = new Date(d)
    const now = new Date()
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  if (!user) {
    return (
      <div className="app-container">
        <nav className="app-nav">
          <Link className="logo" to="/"><span className="logo-icon">&#9670;</span><span className="logo-text">ResumeAI</span></Link>
        </nav>
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128236;</div>
          <h2 className="form-title">Your Career Inbox</h2>
          <p className="form-sub">Sign in to access your dedicated job search email and keep all correspondence in one place.</p>
          <button className="generate-btn" onClick={() => setAuthOpen(true)} style={{ maxWidth: 300 }}>Sign In</button>
        </div>
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    )
  }

  return (
    <div className="app-container" style={{ maxWidth: 960 }}>
      <nav className="app-nav">
        <Link className="logo" to="/"><span className="logo-icon">&#9670;</span><span className="logo-text">ResumeAI</span></Link>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link to="/onboard" className="nav-link">Resume</Link>
          <Link to="/jobs" className="nav-link">Jobs</Link>
          <Link to="/tracker" className="nav-link">Tracker</Link>
          <Link to="/inbox" className="nav-link" style={{ color: 'var(--accent)' }}>
            Inbox {unreadCount > 0 && <span style={{ background: 'var(--accent)', color: '#000', borderRadius: '50%', padding: '1px 6px', fontSize: 11, marginLeft: 4 }}>{unreadCount}</span>}
          </Link>
        </div>
      </nav>

      <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
        {/* Dedicated Email Banner */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '16px 20px', marginBottom: 24,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
        }}>
          {dedicatedEmail ? (
            <>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>YOUR CAREER EMAIL</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
                  {dedicatedEmail}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Use this email on job applications to keep everything in one place
                </div>
              </div>
              <button className="copy-btn" onClick={() => {
                navigator.clipboard.writeText(dedicatedEmail)
                showToast('Email copied!')
              }}>
                &#128203; Copy
              </button>
            </>
          ) : (
            <>
              <div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, color: 'var(--white)' }}>
                  Get Your Dedicated Career Email
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  One email for all job applications — keeps your personal inbox clean
                </div>
              </div>
              <button className="btn-primary" onClick={provisionEmail} disabled={provisioning} style={{ padding: '8px 20px', fontSize: 13 }}>
                {provisioning ? 'Creating...' : 'Create My Email'}
              </button>
            </>
          )}
        </div>

        <h2 className="form-title" style={{ marginTop: 0 }}>&#128236; Inbox</h2>

        {loading ? (
          <div className="generating" style={{ padding: '40px 0' }}>
            <div className="spinner"></div>
            <p className="generating-sub">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#128232;</div>
            <p>No messages yet. Start applying to jobs with your dedicated email and responses will appear here.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: selectedMsg ? '1fr 1.5fr' : '1fr', gap: 16 }}>
            {/* Message List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {messages.map(msg => (
                <div key={msg.id} onClick={() => selectMessage(msg)} style={{
                  padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                  background: selectedMsg?.id === msg.id ? 'var(--accent-glow)' : msg.is_read ? 'transparent' : 'var(--surface)',
                  border: `1px solid ${selectedMsg?.id === msg.id ? 'var(--accent)' : 'var(--border)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{
                      fontSize: 13, fontWeight: msg.is_read ? 400 : 700,
                      color: msg.is_read ? 'var(--text-muted)' : 'var(--white)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%',
                    }}>
                      {msg.direction === 'inbound' ? msg.from_address.split('<')[0].trim() : `To: ${msg.to_address}`}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeFmt(msg.created_at)}</span>
                  </div>
                  <div style={{
                    fontSize: 13, color: msg.is_read ? 'var(--text-muted)' : 'var(--text)',
                    fontWeight: msg.is_read ? 400 : 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {msg.direction === 'outbound' && <span style={{ color: 'var(--accent)', marginRight: 4 }}>&#10148;</span>}
                    {msg.subject}
                  </div>
                  <div style={{
                    fontSize: 12, color: 'var(--text-muted)', marginTop: 4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {msg.body_text?.substring(0, 80)}
                  </div>
                </div>
              ))}
            </div>

            {/* Message Detail */}
            {selectedMsg && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 14, padding: 24, maxHeight: '70vh', overflowY: 'auto',
              }}>
                <h3 style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--white)', marginBottom: 8 }}>
                  {selectedMsg.subject}
                </h3>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
                  {selectedMsg.direction === 'inbound' ? `From: ${selectedMsg.from_address}` : `To: ${selectedMsg.to_address}`}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                  {new Date(selectedMsg.created_at).toLocaleString()}
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  <button className="copy-btn" onClick={startReply}>&#8617; Reply</button>
                  {selectedMsg.application_id && (
                    <Link to={`/tracker`} className="copy-btn" style={{ textDecoration: 'none' }}>
                      &#128203; View Application
                    </Link>
                  )}
                  {/* Detect interview-related emails */}
                  {selectedMsg.direction === 'inbound' &&
                    /interview|schedule|meet|call/i.test(selectedMsg.subject + ' ' + selectedMsg.body_text) && (
                    <button className="btn-primary" style={{ padding: '6px 16px', fontSize: 13 }}
                      onClick={() => navigate(`/interview?company=${encodeURIComponent(selectedMsg.from_address.match(/@([^>]+)/)?.[1]?.split('.')[0] || '')}`)}>
                      &#127919; Prep for Interview
                    </button>
                  )}
                </div>

                <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {selectedMsg.body_text}
                </div>

                {/* Reply Composer */}
                {replyOpen && (
                  <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)', marginBottom: 12 }}>Reply</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                      To: {replyTo}
                    </div>
                    <input className="input" value={replySubject} onChange={e => setReplySubject(e.target.value)}
                      style={{ marginBottom: 8 }} />
                    <textarea className="textarea" rows={6} placeholder="Write your reply..."
                      value={replyBody} onChange={e => setReplyBody(e.target.value)} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button className="btn-primary" onClick={sendReply} disabled={sending} style={{ padding: '8px 20px', fontSize: 13 }}>
                        {sending ? 'Sending...' : 'Send'}
                      </button>
                      <button className="copy-btn" onClick={() => setReplyOpen(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
