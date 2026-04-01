// frontend/src/main.jsx
import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import BrandingProvider from './context/BrandingProvider'
import { AppRoutes } from './routes'
import { useAgentStore } from './store/agentStore'
import './index.css'

function Root() {
  const { setUser, clearUser } = useAgentStore()

  // Restore session on page load and validate token expiry
  useEffect(() => {
    const saved = localStorage.getItem('sfp_session')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        const payload = JSON.parse(atob(parsed.access_token.split('.')[1]))
        if (payload.exp * 1000 > Date.now()) {
          setUser(parsed)
        } else {
          clearUser()
        }
      } catch {
        clearUser()
      }
    }
  }, [])

  return (
    <BrandingProvider>
      <AppRoutes />
    </BrandingProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </React.StrictMode>
)
