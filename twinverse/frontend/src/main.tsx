import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

if (window.location.pathname === '/auth/callback') {
  window.location.replace('/api/auth/callback' + window.location.search);
} else ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
