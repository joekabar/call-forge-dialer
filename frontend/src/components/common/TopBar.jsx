// frontend/src/components/common/TopBar.jsx
import { useState, useEffect } from 'react'
import { useAgentStore }    from '../../store/agentStore'
import { useCallStore }     from '../../store/callStore'
import { useBranding }      from '../../context/BrandingProvider'
import { useNavigate }      from 'react-router-dom'
import { api }              from '../../hooks/api'

export default function TopBar() {
  const { user, clearUser }  = useAgentStore()
  const { contact, callStatus, callDurationSec } = useCallStore()
  const { displayName, logoUrl, primaryColor }    = useBranding()
  const navigate             = useNavigate()
  const [clock, setClock]    = useState('')

  useEffect(() => {
    function tick() {
      const now = new Date()
      setClock(`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`)
    }
    tick()
    const interval = setInterval(tick, 10000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  async function logout() {
    try { await api.post('/auth/logout') } catch {}
    clearUser()
    navigate('/login')
  }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'0 14px', height:46, background:'var(--color-background-primary, #fff)', borderBottom:'0.5px solid var(--color-border-tertiary, #e5e5e0)', flexShrink:0 }}>
      {/* Company logo + name */}
      <div style={{ display:'flex', alignItems:'center', gap:8, fontWeight:500, fontSize:14 }}>
        {logoUrl ? (
          <img src={logoUrl} alt="" style={{ height:26, maxWidth:100, objectFit:'contain' }}/>
        ) : (
          <div style={{ width:26, height:26, background: primaryColor, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><polygon points="6,1 11,10 1,10" fill="white" opacity="0.9"/></svg>
          </div>
        )}
        <span>{displayName}</span>
      </div>

      {/* Active contact pill */}
      {contact && (
        <div style={{ display:'flex', alignItems:'center', gap:6, background:'var(--color-background-secondary, #f5f5f0)', border:'0.5px solid var(--color-border-tertiary, #e5e5e0)', borderRadius:20, padding:'3px 10px', fontSize:12 }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background:'#22c55e' }}/>
          <span>{contact.first_name} {contact.last_name} · {contact.phone_masked}</span>
          {callStatus === 'active' && (
            <span style={{ color:'#22c55e', fontWeight:500 }}>{formatTime(callDurationSec)}</span>
          )}
        </div>
      )}

      <div style={{ flex:1 }}/>

      {/* Status + user info */}
      <div style={{ fontSize:12, color:'var(--color-text-secondary, #888)', display:'flex', alignItems:'center', gap:6 }}>
        <div style={{ width:7, height:7, borderRadius:'50%', background: callStatus === 'active' ? '#22c55e' : '#888' }}/>
        <span>{callStatus === 'active' ? 'In gesprek' : 'Klaar'}</span>
        <span style={{ opacity:0.4 }}>·</span>
        <span>{user?.full_name} · {user?.role}</span>
        <span style={{ opacity:0.4 }}>·</span>
        <span>{clock}</span>
      </div>

      <button onClick={logout} style={{ padding:'4px 10px', borderRadius:6, border:'0.5px solid var(--color-border-secondary, #ccc)', background:'transparent', color:'var(--color-text-secondary, #888)', fontSize:11, cursor:'pointer' }}>
        Uitloggen
      </button>
    </div>
  )
}
