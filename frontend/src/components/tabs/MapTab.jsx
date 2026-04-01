// frontend/src/components/tabs/MapTab.jsx  [v2 — adds Roof Intelligence + ROI]
import { useState } from 'react'
import { useCallStore } from '../../store/callStore'
import RoofIntelligencePanel from '../ai/RoofIntelligencePanel'
import ROICalculator from '../ai/ROICalculator'

const BING_KEY = import.meta.env.VITE_BING_MAPS_KEY || ''

export default function MapTab() {
  const { contact } = useCallStore()
  const [showROI, setShowROI] = useState(false)
  const [roofData, setRoofData] = useState(null)

  const address = contact
    ? [contact.street_verified, contact.city_verified, contact.postal_code_verified]
        .filter(Boolean).join(', ') || 'Belgium'
    : 'Belgium'

  const mapSrc = `https://www.bing.com/maps/embed?h=300&w=800&lvl=18&typ=a&q=${encodeURIComponent(address)}&key=${BING_KEY}`

  const s = {
    wrap:  { height:'100%', display:'flex', flexDirection:'column', padding:12, gap:8, overflowY:'auto', position:'relative' },
    toolbar:{ display:'flex', gap:8, alignItems:'center', flexShrink:0 },
    input: { flex:1, padding:'6px 9px', border:'0.5px solid var(--color-border-secondary)', borderRadius:7, fontSize:12, background:'var(--color-background-primary)', color:'var(--color-text-primary)' },
    btn:   { padding:'6px 12px', borderRadius:7, border:'0.5px solid var(--color-border-secondary)', background:'var(--color-background-primary)', color:'var(--color-text-primary)', fontSize:12, cursor:'pointer' },
    frame: { height:280, border:'0.5px solid var(--color-border-tertiary)', borderRadius:'var(--border-radius-lg)', overflow:'hidden', flexShrink:0 },
    empty: { height:280, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--color-text-secondary)', fontSize:13, background:'var(--color-background-secondary)', borderRadius:'var(--border-radius-lg)', flexShrink:0 },
  }

  return (
    <div style={s.wrap}>
      <div style={s.toolbar}>
        <input style={s.input} defaultValue={address !== 'Belgium' ? address : ''} placeholder="Address loads with contact…" readOnly/>
        <button style={s.btn}>Satellite</button>
        <button style={s.btn}>Street view</button>
      </div>
      <iframe style={s.frame} src={mapSrc} title="Property map" frameBorder="0" allowFullScreen/>
      <RoofIntelligencePanel onOpenROI={(d) => { setRoofData(d); setShowROI(true) }} />
      {showROI && <ROICalculator roofData={roofData} onClose={() => setShowROI(false)} />}
    </div>
  )
}
