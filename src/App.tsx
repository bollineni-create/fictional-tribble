import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './components/Toast'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import ResumeBuilder from './pages/ResumeBuilder'
import JobSearch from './pages/JobSearch'
import ApplicationTracker from './pages/ApplicationTracker'
import InterviewPrep from './pages/InterviewPrep'
import Onboard from './pages/Onboard'
import Inbox from './pages/Inbox'
import Preferences from './pages/Preferences'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/app" element={<ResumeBuilder />} />
            <Route path="/onboard" element={<Onboard />} />
            <Route path="/jobs" element={<JobSearch />} />
            <Route path="/tracker" element={<ApplicationTracker />} />
            <Route path="/interview" element={<InterviewPrep />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/preferences" element={<Preferences />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
