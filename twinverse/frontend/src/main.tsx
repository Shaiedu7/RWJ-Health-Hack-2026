import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import FacultyFeedback from './feedback/FacultyFeedback.tsx'
import StudentDemoFeedback from './feedback/StudentDemoFeedback.tsx'
import './index.css'

if (window.location.pathname === '/auth/callback') {
  window.location.replace('/api/auth/callback' + window.location.search);
} else ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith('/feedback/faculty') ? <FacultyFeedback /> : window.location.pathname.startsWith('/feedback/student') ? <StudentDemoFeedback /> : <App />}
  </React.StrictMode>,
)
