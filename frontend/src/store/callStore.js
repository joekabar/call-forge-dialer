// frontend/src/store/callStore.js
import { create } from 'zustand'

export const useCallStore = create((set, get) => ({
  contact:         null,
  callStatus:      'idle',   // idle | loading | active | wrapup
  callDurationSec: 0,
  callStartedAt:   null,
  waitSeconds:     0,
  scriptStep:      'intro',
  _timer:          null,
  _waitTimer:      null,

  setContact:    (c) => set({ contact: c }),
  clearContact:  ()  => set({ contact: null }),
  setCallStatus: (s) => set({ callStatus: s }),
  setScriptStep: (step) => set({ scriptStep: step }),

  // Used by AgentWorkspace interval ticker
  tickDuration: () => set((s) => ({ callDurationSec: s.callDurationSec + 1 })),

  setWaitSeconds: (seconds) => {
    const { _waitTimer } = get()
    if (_waitTimer) clearInterval(_waitTimer)
    if (seconds <= 0) { set({ waitSeconds: 0, _waitTimer: null }); return }

    set({ waitSeconds: seconds })
    const timer = setInterval(() => {
      const current = get().waitSeconds
      if (current <= 1) {
        clearInterval(timer)
        set({ waitSeconds: 0, _waitTimer: null })
      } else {
        set({ waitSeconds: current - 1 })
      }
    }, 1000)
    set({ _waitTimer: timer })
  },

  startCall: () => {
    const now = Date.now()
    const timer = setInterval(() => {
      set({ callDurationSec: Math.floor((Date.now() - now) / 1000) })
    }, 1000)
    set({ callStatus: 'active', callStartedAt: now, callDurationSec: 0, _timer: timer })
  },

  endCall: () => {
    const { _timer } = get()
    if (_timer) clearInterval(_timer)
    set({ callStatus: 'wrapup', _timer: null })
  },

  resetCall: () => {
    const { _timer } = get()
    if (_timer) clearInterval(_timer)
    set({
      contact: null, callStatus: 'idle', callDurationSec: 0,
      callStartedAt: null, scriptStep: 'intro', _timer: null,
    })
  },
}))
