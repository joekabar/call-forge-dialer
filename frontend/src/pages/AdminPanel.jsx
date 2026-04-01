// frontend/src/pages/AdminPanel.jsx
// ──────────────────────────────────
// Admin dashboard for a single org. Shows company branding.

import { useState }          from 'react'
import { useAgentStore }     from '../store/agentStore'
import { useBranding }       from '../context/BrandingProvider'
import { useNavigate }       from 'react-router-dom'
import { api }               from '../hooks/api'
import CampaignsTab           from '../components/admin/CampaignsTab'
import ContactsTab            from '../components/admin/ContactsTab'
import UsersTab               from '../components/admin/UsersTab'
import TelephonySettingsTab   from '../components/admin/TelephonySettingsTab'

const TABS = ['Users', 'Campaigns', 'Contacts', 'Scripts', 'Reports', 'Settings']

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('Campaigns')
  const { user, clearUser }       = useAgentStore()
  const { displayName, logoUrl, primaryColor } = useBranding()
  const navigate                  = useNavigate()

  async function logout() {
    try { await api.post('/auth/logout') } catch {}
    clearUser()
    navigate('/login')
  }

  const s = {
    page:    { minHeight:'100vh', background:'var(--color-background-tertiary, #f5f5f0)' },
    header:  { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 20px', height:50, background:'var(--color-background-primary, #fff)', borderBottom:'0.5px solid var(--color-border-tertiary, #e5e5e0)' },
    brand:   { display:'flex', alignItems:'center', gap:8 },
    logoBox: { width:26, height:26, background:primaryColor, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center' },
    name:    { fontSize:14, fontWeight:500 },
    dash:    { fontSize:12, color:'var(--color-text-secondary, #888)', marginLeft:4 },
    info:    { display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--color-text-secondary, #888)' },
    btn:     { padding:'4px 10px', borderRadius:6, border:'0.5px solid var(--color-border-secondary, #ccc)', background:'transparent', fontSize:11, cursor:'pointer', color:'var(--color-text-secondary, #888)' },
    tabs:    { display:'flex', gap:0, background:'var(--color-background-primary, #fff)', borderBottom:'0.5px solid var(--color-border-tertiary, #e5e5e0)', padding:'0 20px' },
    tab:     (active) => ({ padding:'10px 14px', fontSize:12, cursor:'pointer', borderBottom: active ? `2px solid ${primaryColor}` : '2px solid transparent', color: active ? 'var(--color-text-primary, #1a1a1a)' : 'var(--color-text-secondary, #888)', fontWeight: active ? 500 : 400, background:'transparent', border:'none', borderBottomWidth:2, borderBottomStyle:'solid', borderBottomColor: active ? primaryColor : 'transparent' }),
    body:    { padding:20 },
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.brand}>
          {logoUrl ? (
            <img src={logoUrl} alt="" style={{ height:26, maxWidth:100, objectFit:'contain' }}/>
          ) : (
            <div style={s.logoBox}>
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><polygon points="6,1 11,10 1,10" fill="white" opacity="0.9"/></svg>
            </div>
          )}
          <span style={s.name}>{displayName}</span>
          <span style={s.dash}>— Admin</span>
        </div>
        <div style={s.info}>
          <span>{user?.full_name} · {user?.role}</span>
          <button style={s.btn} onClick={logout}>Uitloggen</button>
        </div>
      </div>

      <div style={s.tabs}>
        {TABS.map(t => (
          <button key={t} style={s.tab(activeTab === t)} onClick={() => setActiveTab(t)}>{t}</button>
        ))}
      </div>

      <div style={s.body}>
        {activeTab === 'Users'     && <UsersTab />}
        {activeTab === 'Campaigns' && <CampaignsTab />}
        {activeTab === 'Contacts'  && <ContactsTab />}
        {activeTab === 'Scripts'   && <div style={{ color:'#888', padding:40, textAlign:'center', fontSize:13 }}>Scriptbeheer — komt in Sprint 4</div>}
        {activeTab === 'Reports'   && <div style={{ color:'#888', padding:40, textAlign:'center', fontSize:13 }}>Rapportage — komt in Sprint 5</div>}
        {activeTab === 'Settings'  && <TelephonySettingsTab />}
      </div>
    </div>
  )
}
