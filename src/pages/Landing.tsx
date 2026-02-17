import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="container">
      <Navbar />

      <div className="hero">
        <div className="badge">&#10022; AI-Powered Career Tools</div>
        <h1 className="hero-title">
          Land Your Dream Job<br />
          <span className="hero-accent">With AI Precision</span>
        </h1>
        <p className="hero-sub">
          Generate tailored resumes and cover letters in seconds.
          ATS-optimized, professionally written, and personalized to every job you apply for.
        </p>
        <div className="hero-ctas">
          <button className="btn-primary" onClick={() => navigate('/app')}>Build My Resume — Free</button>
          <button className="btn-secondary" onClick={() => navigate('/app?tab=coverLetter')}>Write Cover Letter</button>
        </div>
        <p className="hero-note">3 free generations per day &middot; No sign-up required</p>
      </div>

      <div className="features">
        <div className="feature-card">
          <div className="feature-icon">&#9889;</div>
          <div className="feature-title">AI Resume Builder</div>
          <div className="feature-desc">Generate tailored resumes and cover letters in seconds. Export to DOCX or PDF.</div>
        </div>
        <div className="feature-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/jobs')}>
          <div className="feature-icon">&#128269;</div>
          <div className="feature-title">Smart Job Search</div>
          <div className="feature-desc">Search thousands of listings. AI matches jobs to your skills and experience.</div>
        </div>
        <div className="feature-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/tracker')}>
          <div className="feature-icon">&#128203;</div>
          <div className="feature-title">Application Tracker</div>
          <div className="feature-desc">Kanban board to track every application from saved to offer.</div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">&#127919;</div>
          <div className="feature-title">ATS Score Checker</div>
          <div className="feature-desc">Analyze your resume against any job. Get keyword matches and improvement tips.</div>
        </div>
        <div className="feature-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/interview')}>
          <div className="feature-icon">&#127891;</div>
          <div className="feature-title">Interview Prep</div>
          <div className="feature-desc">AI-generated questions, company briefs, and salary negotiation tips.</div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">&#10024;</div>
          <div className="feature-title">Multiple Tones</div>
          <div className="feature-desc">Professional, confident, creative, or executive — match the company culture.</div>
        </div>
      </div>

      <div className="pricing" id="pricing-anchor">
        <h2 className="section-title">Simple Pricing</h2>
        <div className="pricing-cards">
          <div className="pricing-card">
            <div className="pricing-tier">Free</div>
            <div className="pricing-price">$0<span className="pricing-period">/forever</span></div>
            <ul className="pricing-list">
              <li className="pricing-item">&#10003; 3 generations per day</li>
              <li className="pricing-item">&#10003; Resume &amp; cover letter</li>
              <li className="pricing-item">&#10003; Basic formatting</li>
              <li className="pricing-item">&#10003; Copy to clipboard</li>
            </ul>
            <button className="pricing-btn" onClick={() => navigate('/app')}>Start Free</button>
          </div>
          <div className="pricing-card pro">
            <div className="pro-badge">POPULAR</div>
            <div className="pricing-tier">Pro</div>
            <div className="pricing-price">$9<span className="pricing-period">/month</span></div>
            <ul className="pricing-list">
              <li className="pricing-item">&#10003; Unlimited generations</li>
              <li className="pricing-item">&#10003; Premium templates</li>
              <li className="pricing-item">&#10003; Export to DOCX &amp; PDF</li>
              <li className="pricing-item">&#10003; ATS score analysis</li>
              <li className="pricing-item">&#10003; Priority support</li>
            </ul>
            <button className="pricing-btn pro-btn" onClick={() => navigate('/app?upgrade=true')}>Upgrade to Pro</button>
          </div>
        </div>
      </div>

      <footer className="footer">
        <span className="footer-logo">&#9670; ResumeAI</span>
        <span className="footer-text">&copy; 2026 &middot; Built with AI</span>
      </footer>
    </div>
  )
}
