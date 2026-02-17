import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'

interface SavedResume {
  id: string
  title: string
  type: string
  content: string
  job_title: string
  company: string
  created_at: string
}

interface SavedResumesModalProps {
  isOpen: boolean
  onClose: () => void
  onView: (resume: SavedResume) => void
}

export default function SavedResumesModal({ isOpen, onClose, onView }: SavedResumesModalProps) {
  const [resumes, setResumes] = useState<SavedResume[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const { showToast } = useToast()

  useEffect(() => {
    if (isOpen && user) loadResumes()
  }, [isOpen, user])

  const loadResumes = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('saved_resumes')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
    setResumes(data || [])
    setLoading(false)
  }

  const copyResume = (resume: SavedResume) => {
    navigator.clipboard.writeText(resume.content)
    showToast('Copied to clipboard!')
  }

  const deleteResume = async (id: string) => {
    if (!confirm('Delete this resume?')) return
    await supabase.from('saved_resumes').delete().eq('id', id)
    loadResumes()
  }

  const escapeHtml = (str: string) => {
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 550 }}>
        <button className="modal-close" onClick={onClose}>&#10005;</button>
        <div className="modal-icon">&#128196;</div>
        <h2 className="modal-title">My Saved Resumes</h2>
        <div className="saved-list">
          {loading ? (
            <div className="empty-state">Loading...</div>
          ) : resumes.length === 0 ? (
            <div className="empty-state">No saved resumes yet. Generate one and click &#128190; Save!</div>
          ) : (
            resumes.map((r) => (
              <div key={r.id} className="saved-card">
                <div className="saved-card-title" dangerouslySetInnerHTML={{ __html: escapeHtml(r.title) }} />
                <div className="saved-card-meta">
                  {r.type === 'resume' ? '&#128196; Resume' : '&#9993;&#65039; Cover Letter'}
                  {' '}&middot;{' '}{new Date(r.created_at).toLocaleDateString()}
                </div>
                <div className="saved-card-actions">
                  <button className="saved-card-btn" onClick={() => { onView(r); onClose() }}>View</button>
                  <button className="saved-card-btn" onClick={() => copyResume(r)}>Copy</button>
                  <button className="saved-card-btn delete" onClick={() => deleteResume(r.id)}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
