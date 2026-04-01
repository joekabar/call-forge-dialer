// frontend/src/pages/LoginPage.jsx
// ──────────────────────────────────
// Login only. Stores branding from API response.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAgentStore } from '../store/agentStore'
import { api } from '../hooks/api'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const { setUser } = useAgentStore()
  const navigate    = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/auth/login', {
        email: form.email, password: form.password,
      })
      console.log('Login response:', res)
      setUser({
        access_token:  res.access_token,
        refresh_token: res.refresh_token,
        ...res.user,
      })
      const dest = res.user.is_platform_admin
        ? '/platform'
        : { admin: '/admin', supervisor: '/supervisor', client: '/portal', agent: '/workspace' }[res.user.role] || '/workspace'
      navigate(dest)
    } catch (err) {
      setError(err.message || 'Ongeldig e-mailadres of wachtwoord')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f0' }}>
      <div style={{ background: '#fff', border: '0.5px solid #e0ddd5', borderRadius: 12, padding: 32, width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <div style={{ width: 28, height: 28, background: '#1d6fb8', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><polygon points="7,1 13,12 1,12" fill="white" opacity="0.9"/></svg>
          </div>
          <span style={{ fontSize: 16, fontWeight: 500 }}>SolarFlow Pro</span>
        </div>

        <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Welkom terug</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Meld je aan bij je account</div>

        {error && <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 7, padding: '8px 10px', fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <form onSubmit={handleLogin}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: '#888' }}>E-mailadres</span>
            <input style={{ padding: '8px 10px', border: '0.5px solid #ccc', borderRadius: 7, fontSize: 13 }} type="email" value={form.email} onChange={set('email')} required placeholder="jan@bedrijf.be"/>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: '#888' }}>Wachtwoord</span>
            <input style={{ padding: '8px 10px', border: '0.5px solid #ccc', borderRadius: 7, fontSize: 13 }} type="password" value={form.password} onChange={set('password')} required placeholder="••••••••" minLength={8}/>
          </label>
          <button style={{ width: '100%', padding: 9, borderRadius: 7, border: 'none', background: '#1d6fb8', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', marginTop: 4 }} type="submit" disabled={loading}>
            {loading ? 'Even geduld…' : 'Inloggen'}
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#aaa', marginTop: 20 }}>
          Geen account? Neem contact op met je bedrijfsbeheerder.
        </div>
      </div>
    </div>
  )
}
