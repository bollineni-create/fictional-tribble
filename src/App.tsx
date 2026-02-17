import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './components/Toast'
import Landing from './pages/Landing'
import ResumeBuilder from './pages/ResumeBuilder'
import JobSearch from './pages/JobSearch'
import ApplicationTracker from './pages/ApplicationTracker'
import InterviewPrep from './pages/InterviewPrep'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app" element={<ResumeBuilder />} />
            <Route path="/jobs" element={<JobSearch />} />
            <Route path="/tracker" element={<ApplicationTracker />} />
            <Route path="/interview" element={<InterviewPrep />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
