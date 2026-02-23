import { useState, useRef, useCallback, useEffect } from 'react'
import { useToast } from './Toast'

// Pre-load PDF.js library on module load so it's cached for when the user uploads
let pdfjsCache: typeof import('pdfjs-dist') | null = null
const pdfjsReady = import('pdfjs-dist').then((lib) => {
  lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/pdf.worker.min.js`
  pdfjsCache = lib
  return lib
}).catch(() => null)

interface ResumeUploaderProps {
  onParsed: (text: string) => void
  loading: boolean
}

export default function ResumeUploader({ onParsed, loading }: ResumeUploaderProps) {
  const [dragActive, setDragActive] = useState(false)
  const [fileName, setFileName] = useState('')
  const [extracting, setExtracting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()

  // Warm up PDF.js worker on mount (pre-fetches from CDN)
  useEffect(() => { pdfjsReady }, [])

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const pdfjsLib = pdfjsCache || await pdfjsReady
    if (!pdfjsLib) throw new Error('Failed to load PDF library')

    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

    // Process all pages in parallel instead of sequentially
    const pagePromises = Array.from({ length: pdf.numPages }, async (_, i) => {
      const page = await pdf.getPage(i + 1)
      const content = await page.getTextContent()
      return content.items.map((item: any) => item.str).join(' ')
    })

    const pages = await Promise.all(pagePromises)
    return pages.join('\n\n')
  }

  const extractTextFromDocx = async (file: File): Promise<string> => {
    const mammoth = await import('mammoth')
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value
  }

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['pdf', 'docx', 'doc', 'txt'].includes(ext || '')) {
      showToast('Please upload a PDF, DOCX, or TXT file')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast('File too large (max 10MB)')
      return
    }

    setFileName(file.name)
    setExtracting(true)

    try {
      let text = ''
      if (ext === 'pdf') {
        text = await extractTextFromPdf(file)
      } else if (ext === 'docx' || ext === 'doc') {
        text = await extractTextFromDocx(file)
      } else {
        text = await file.text()
      }

      if (text.trim().length < 50) {
        showToast('Could not extract enough text from this file. Try a different format.')
        setExtracting(false)
        return
      }

      onParsed(text)
    } catch (err) {
      console.error('File extraction error:', err)
      showToast('Failed to read file. Try a different format.')
    } finally {
      setExtracting(false)
    }
  }, [onParsed, showToast])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0])
    }
  }, [handleFile])

  const isProcessing = extracting || loading

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      onClick={() => !isProcessing && inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragActive ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 16,
        padding: '48px 32px',
        textAlign: 'center',
        cursor: isProcessing ? 'wait' : 'pointer',
        background: dragActive ? 'var(--accent-glow)' : 'var(--surface)',
        transition: 'all 0.2s ease',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.doc,.txt"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {isProcessing ? (
        <>
          <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--white)', marginBottom: 8 }}>
            {extracting ? 'Reading your resume...' : 'AI is parsing your resume...'}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            {fileName && `Processing ${fileName}`}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128196;</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--white)', marginBottom: 8 }}>
            Upload Your Resume
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
            Drag and drop your PDF, DOCX, or TXT file here, or click to browse
          </div>
          <div style={{
            display: 'inline-block',
            padding: '10px 24px',
            background: 'var(--accent)',
            color: '#000',
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 14,
          }}>
            Choose File
          </div>
        </>
      )}
    </div>
  )
}
