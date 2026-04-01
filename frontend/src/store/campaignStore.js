// frontend/src/store/campaignStore.js
// ───────────────────────────────────
// Stores the currently selected campaign + daily stats.

import { create } from 'zustand'

export const useCampaignStore = create((set) => ({
  campaign: null,
  campaigns: [],
  callsToday: 0,
  reachedToday: 0,

  setCampaign:    (c) => set({ campaign: c }),
  setCampaigns:   (list) => set({ campaigns: list }),
  incrementCalls: () => set((s) => ({ callsToday: s.callsToday + 1 })),
  incrementReached: () => set((s) => ({ reachedToday: s.reachedToday + 1 })),
  resetDailyStats: () => set({ callsToday: 0, reachedToday: 0 }),
}))
