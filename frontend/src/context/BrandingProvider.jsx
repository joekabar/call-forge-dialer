// frontend/src/context/BrandingProvider.jsx
// ────────────────────────────────────────────
// Reads branding from agentStore and applies CSS variables.
// Wrap your app with <BrandingProvider> in main.jsx.

import { createContext, useContext, useEffect } from 'react'
import { useAgentStore } from '../store/agentStore'

const BrandingContext = createContext({
  displayName: 'SolarFlow Pro',
  logoUrl: null,
  primaryColor: '#1d6fb8',
})

export function useBranding() {
  return useContext(BrandingContext)
}

function hexToHsl(hex) {
  hex = hex.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16) / 255
  const g = parseInt(hex.substring(2, 4), 16) / 255
  const b = parseInt(hex.substring(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0, l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export default function BrandingProvider({ children }) {
  const { user } = useAgentStore()
  const branding = user?.branding || {}
  const displayName  = branding.display_name || 'SolarFlow Pro'
  const logoUrl      = branding.logo_url || null
  const primaryColor = branding.primary_color || '#1d6fb8'

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--brand-color', primaryColor)

    // Generate hover and active variants via HSL
    try {
      const { h, s, l } = hexToHsl(primaryColor)
      root.style.setProperty('--brand-color-hover', `hsl(${h}, ${s}%, ${Math.max(l - 8, 10)}%)`)
      root.style.setProperty('--brand-color-active', `hsl(${h}, ${s}%, ${Math.max(l - 14, 5)}%)`)
      root.style.setProperty('--brand-color-light', `hsl(${h}, ${s}%, ${Math.min(l + 35, 95)}%)`)
      root.style.setProperty('--brand-color-text', l > 55 ? '#1a1a1a' : '#ffffff')
    } catch {
      root.style.setProperty('--brand-color-hover', primaryColor)
      root.style.setProperty('--brand-color-active', primaryColor)
      root.style.setProperty('--brand-color-light', '#e8f0fe')
      root.style.setProperty('--brand-color-text', '#ffffff')
    }
  }, [primaryColor])

  return (
    <BrandingContext.Provider value={{ displayName, logoUrl, primaryColor }}>
      {children}
    </BrandingContext.Provider>
  )
}
