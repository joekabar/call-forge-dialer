// frontend/src/hooks/api.js
// ──────────────────────────
// Central API client with automatic token refresh.
// All hooks import from here — never use fetch() directly.


const BASE_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api` 
  : '/api';


function getSession() {
  const raw = localStorage.getItem('sfp_session')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

function getToken() {
  const session = getSession()
  return session?.access_token || null
}

function isTokenExpired(token) {
  if (!token) return true
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    // Refresh 2 minutes before actual expiry
    return payload.exp * 1000 < Date.now() + 120000
  } catch { return true }
}

async function refreshToken() {
  const session = getSession()
  if (!session?.refresh_token) return null

  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.access_token) {
      const updated = { ...session, access_token: data.access_token, refresh_token: data.refresh_token }
      localStorage.setItem('sfp_session', JSON.stringify(updated))
      return data.access_token
    }
  } catch (e) {
    console.error('Token refresh failed:', e)
  }
  return null
}

async function getValidToken() {
  let token = getToken()
  if (isTokenExpired(token)) {
    token = await refreshToken()
    if (!token) {
      // Refresh failed — clear session, redirect to login
      localStorage.removeItem('sfp_session')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
      return null
    }
  }
  return token
}

async function request(method, path, body = null) {
  const token = await getValidToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    // If 401 after refresh attempt, redirect to login
    if (res.status === 401) {
      localStorage.removeItem('sfp_session')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    const err = new Error(data.detail?.message || data.detail || 'Verzoek mislukt')
    err.status = res.status
    err.detail = data.detail
    throw err
  }

  return data
}

export const api = {
  get:    (path)        => request('GET',    path),
  post:   (path, body)  => request('POST',   path, body),
  put:    (path, body)  => request('PUT',    path, body),
  delete: (path)        => request('DELETE', path),
}
