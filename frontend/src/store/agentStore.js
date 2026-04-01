// frontend/src/store/agentStore.js
// ─────────────────────────────────
// Global user state. Persists to localStorage.

import { create } from 'zustand'

function loadSession() {
  try {
    const raw = localStorage.getItem('sfp_session')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export const useAgentStore = create((set) => ({
  user: loadSession(),

  setUser: (data) => {
    localStorage.setItem('sfp_session', JSON.stringify(data))
    set({ user: data })
  },

  clearUser: () => {
    localStorage.removeItem('sfp_session')
    set({ user: null })
  },
}))
