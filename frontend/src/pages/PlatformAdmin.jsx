// frontend/src/pages/PlatformAdmin.jsx
// ─────────────────────────────────────
// Super admin dashboard — manage all orgs, users, branding, trials.

import { useState, useEffect } from 'react'
import { useAgentStore } from '../store/agentStore'
import { useNavigate }   from 'react-router-dom'
import { api }           from '../hooks/api'

const TABS = ['Overzicht', 'Bedrijven', 'Gebruikers']

export default function PlatformAdmin() {
  const [tab, setTab]       = useState('Overzicht')
  const [stats, setStats]   = useState(null)
  const [orgs, setOrgs]     = useState([])
  const [users, setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const { user, clearUser } = useAgentStore()
  const navigate            = useNavigate()

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [s, o, u] = await Promise.all([
        api.get('/platform/stats'),
        api.get('/platform/organizations'),
        api.get('/platform/users'),
      ])
      setStats(s)
      setOrgs(o.organizations || [])
      setUsers(u.users || [])
    } catch (e) { console.error('Platform load error:', e) }
    finally { setLoading(false) }
  }

  async function logout() {
    try { await api.post('/auth/logout') } catch {}
    clearUser()
    navigate('/login')
  }

  const C = {
    bg:    '#0f1117',
    card:  '#181a22',
    bdr:   '#2a2d38',
    txt:   '#e2e2e6',
    sub:   '#8b8d97',
    brand: '#6c8cff',
    green: '#34d399',
    amber: '#f59e0b',
    red:   '#f87171',
  }

  const s = {
    page:   { minHeight:'100vh', background:C.bg, color:C.txt, fontFamily:'system-ui, sans-serif' },
    header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', height:52, borderBottom:`0.5px solid ${C.bdr}` },
    logo:   { display:'flex', alignItems:'center', gap:8, fontWeight:500, fontSize:15 },
    sq:     { width:24, height:24, background:C.brand, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center' },
    tabs:   { display:'flex', gap:0, borderBottom:`0.5px solid ${C.bdr}`, padding:'0 24px' },
    tab:    (a) => ({ padding:'12px 16px', fontSize:12, cursor:'pointer', background:'transparent', border:'none', borderBottom: a ? `2px solid ${C.brand}` : '2px solid transparent', color: a ? C.txt : C.sub, fontWeight: a ? 500 : 400 }),
    body:   { padding:24 },
    grid:   { display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:24 },
    metric: { background:C.card, border:`0.5px solid ${C.bdr}`, borderRadius:10, padding:16 },
    ml:     { fontSize:10, color:C.sub, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 },
    mv:     { fontSize:26, fontWeight:500 },
    ms:     { fontSize:11, color:C.sub, marginTop:2 },
    tbl:    { width:'100%', borderCollapse:'collapse', fontSize:12 },
    th:     { textAlign:'left', padding:'8px 10px', borderBottom:`0.5px solid ${C.bdr}`, color:C.sub, fontSize:10, fontWeight:500, textTransform:'uppercase', letterSpacing:'.05em' },
    td:     { padding:'10px 10px', borderBottom:`0.5px solid ${C.bdr}` },
    pill:   (color) => ({ display:'inline-block', padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:500, background: color === 'green' ? '#0f5132' : color === 'amber' ? '#5c3d0e' : color === 'red' ? '#5c1010' : '#2a2d38', color: color === 'green' ? '#34d399' : color === 'amber' ? '#f59e0b' : color === 'red' ? '#f87171' : C.sub }),
    btn:    { padding:'5px 12px', borderRadius:6, border:`0.5px solid ${C.bdr}`, background:C.card, color:C.txt, fontSize:11, cursor:'pointer' },
    btnP:   { padding:'6px 14px', borderRadius:7, border:'none', background:C.brand, color:'#fff', fontSize:12, fontWeight:500, cursor:'pointer' },
    btnD:   { padding:'5px 12px', borderRadius:6, border:`0.5px solid #5c1010`, background:'#1a0808', color:C.red, fontSize:11, cursor:'pointer' },
    swatch: (c) => ({ width:20, height:20, borderRadius:4, background:c, border:'1px solid rgba(255,255,255,.15)', flexShrink:0 }),
    info:   { display:'flex', alignItems:'center', gap:8, fontSize:12, color:C.sub },
  }

  // ── Overview Tab ──────────────────────────
  function Overview() {
    if (!stats) return <div style={{ color:C.sub }}>Laden…</div>
    const { organizations: o, users: u, contacts: c, calls: cl } = stats
    return (
      <>
        <div style={s.grid}>
          <div style={s.metric}><div style={s.ml}>Bedrijven</div><div style={s.mv}>{o.total}</div><div style={s.ms}>{o.active} actief · {o.trial} trial</div></div>
          <div style={s.metric}><div style={s.ml}>Gebruikers</div><div style={s.mv}>{u.total}</div><div style={s.ms}>{u.agents} agents · {u.admins} admins</div></div>
          <div style={s.metric}><div style={s.ml}>Contacten</div><div style={s.mv}>{c.total}</div><div style={s.ms}>{c.available} beschikbaar · {c.called} gebeld</div></div>
          <div style={s.metric}><div style={s.ml}>Gesprekken</div><div style={s.mv}>{cl.total}</div><div style={s.ms}>{cl.interested} geïnteresseerd · {cl.conversion_rate}%</div></div>
        </div>
      </>
    )
  }

  // ── Organizations Tab ─────────────────────
  function OrgsTab() {
    const [showForm, setShowForm]  = useState(false)
    const [editOrg, setEditOrg]    = useState(null)
    const [form, setForm] = useState({
      name:'', display_name:'', country:'BE', plan:'trial',
      logo_url:'', primary_color:'#1d6fb8', seat_limit:3, trial_days:7,
    })

    function resetForm() {
      setForm({ name:'', display_name:'', country:'BE', plan:'trial', logo_url:'', primary_color:'#1d6fb8', seat_limit:3, trial_days:7 })
      setEditOrg(null)
      setShowForm(false)
    }

    function openEdit(org) {
      setForm({
        name: org.name, display_name: org.display_name || org.name,
        country: org.country, plan: org.plan,
        logo_url: org.logo_url || '', primary_color: org.primary_color || '#1d6fb8',
        seat_limit: org.seat_limit, trial_days: 7,
      })
      setEditOrg(org)
      setShowForm(true)
    }

    async function handleSave() {
      try {
        if (editOrg) {
          await api.put(`/platform/organizations/${editOrg.id}`, {
            name: form.name, display_name: form.display_name || form.name,
            country: form.country, plan: form.plan,
            logo_url: form.logo_url || null, primary_color: form.primary_color,
            seat_limit: form.seat_limit,
          })
        } else {
          await api.post('/platform/organizations', form)
        }
        resetForm()
        loadAll()
      } catch (e) { alert(e.message) }
    }

    async function toggleActive(org) {
      try {
        await api.put(`/platform/organizations/${org.id}`, { is_active: !org.is_active })
        loadAll()
      } catch (e) { alert(e.message) }
    }

    async function extendTrial(org) {
      try {
        await api.post(`/platform/organizations/${org.id}/extend-trial`, { days: 7 })
        loadAll()
      } catch (e) { alert(e.message) }
    }

    async function deleteOrg(org) {
      // First try normal delete
      const confirmed = confirm(
        `"${org.name}" verwijderen?\n\n` +
        `Dit bedrijf heeft ${org.user_count} gebruiker(s) en ${org.contact_count} contacten.\n\n` +
        `Klik OK voor geforceerde verwijdering van ALLE data (gebruikers, contacten, campagnes, gesprekken).`
      )
      if (!confirmed) return

      try {
        // Always use force=true from the UI — we confirmed above
        const BASE_URL = import.meta.env.VITE_API_URL || '/api'
        const session = localStorage.getItem('sfp_session')
        const token = session ? JSON.parse(session).access_token : null

        const res = await fetch(`${BASE_URL}/platform/organizations/${org.id}?force=true`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.detail || `Verwijderen mislukt (${res.status})`)
        }

        loadAll()
      } catch (e) { alert(e.message) }
    }

    const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))
    const inp = { padding:'6px 10px', borderRadius:6, border:`0.5px solid ${C.bdr}`, background:C.bg, color:C.txt, fontSize:12, width:'100%' }
    const lbl = { fontSize:10, color:C.sub, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3 }

    return (
      <>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:500 }}>Bedrijven</div>
          <button style={s.btnP} onClick={() => { resetForm(); setShowForm(true) }}>+ Nieuw bedrijf</button>
        </div>

        {showForm && (
          <div style={{ background:C.card, border:`0.5px solid ${C.bdr}`, borderRadius:10, padding:20, marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:500, marginBottom:14 }}>{editOrg ? 'Bedrijf bewerken' : 'Nieuw bedrijf'}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div><div style={lbl}>Bedrijfsnaam</div><input style={inp} value={form.name} onChange={f('name')} placeholder="Solar NV"/></div>
              <div><div style={lbl}>Weergavenaam</div><input style={inp} value={form.display_name} onChange={f('display_name')} placeholder="Solar NV"/></div>
              <div><div style={lbl}>Logo URL</div><input style={inp} value={form.logo_url} onChange={f('logo_url')} placeholder="https://example.com/logo.png"/></div>
              <div>
                <div style={lbl}>Merk kleur</div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <input type="color" value={form.primary_color} onChange={f('primary_color')} style={{ width:36, height:30, border:'none', background:'transparent', cursor:'pointer' }}/>
                  <input style={{ ...inp, flex:1 }} value={form.primary_color} onChange={f('primary_color')} placeholder="#1d6fb8"/>
                </div>
              </div>
              <div><div style={lbl}>Land</div>
                <select style={inp} value={form.country} onChange={f('country')}>
                  <option value="BE">België</option><option value="NL">Nederland</option>
                  <option value="FR">Frankrijk</option><option value="DE">Duitsland</option>
                </select>
              </div>
              <div><div style={lbl}>Plan</div>
                <select style={inp} value={form.plan} onChange={f('plan')}>
                  <option value="trial">Trial</option><option value="starter">Starter</option>
                  <option value="pro">Pro</option><option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div><div style={lbl}>Seats</div><input style={inp} type="number" min={1} max={100} value={form.seat_limit} onChange={f('seat_limit')}/></div>
              {!editOrg && <div><div style={lbl}>Trial dagen</div><input style={inp} type="number" min={1} max={90} value={form.trial_days} onChange={f('trial_days')}/></div>}
            </div>
            {/* Branding preview */}
            <div style={{ marginTop:16, padding:12, background:C.bg, borderRadius:8, border:`0.5px solid ${C.bdr}` }}>
              <div style={{ fontSize:10, color:C.sub, marginBottom:8 }}>VOORBEELD</div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                {form.logo_url ? (
                  <img src={form.logo_url} alt="" style={{ height:28, maxWidth:100, objectFit:'contain' }} onError={(e) => e.target.style.display='none'}/>
                ) : (
                  <div style={{ width:28, height:28, background:form.primary_color, borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><polygon points="6,1 11,10 1,10" fill="white" opacity="0.9"/></svg>
                  </div>
                )}
                <span style={{ fontWeight:500, fontSize:14 }}>{form.display_name || form.name || 'Bedrijfsnaam'}</span>
                <span style={{ color:C.sub, fontSize:12 }}>— Admin</span>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:14, justifyContent:'flex-end' }}>
              <button style={s.btn} onClick={resetForm}>Annuleren</button>
              <button style={s.btnP} onClick={handleSave} disabled={!form.name}>{editOrg ? 'Opslaan' : 'Aanmaken'}</button>
            </div>
          </div>
        )}

        <table style={s.tbl}>
          <thead><tr>
            <th style={s.th}>Merk</th>
            <th style={s.th}>Bedrijf</th>
            <th style={s.th}>Land</th>
            <th style={s.th}>Plan</th>
            <th style={s.th}>Users</th>
            <th style={s.th}>Contacten</th>
            <th style={s.th}>Status</th>
            <th style={s.th}>Acties</th>
          </tr></thead>
          <tbody>
            {orgs.map(org => (
              <tr key={org.id}>
                <td style={s.td}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    {org.logo_url ? (
                      <img src={org.logo_url} alt="" style={{ height:20, maxWidth:60, objectFit:'contain' }} onError={(e) => e.target.style.display='none'}/>
                    ) : (
                      <div style={{ ...s.swatch(org.primary_color || '#1d6fb8') }}/>
                    )}
                  </div>
                </td>
                <td style={s.td}>
                  <div style={{ fontWeight:500 }}>{org.display_name || org.name}</div>
                  {org.display_name && org.display_name !== org.name && (
                    <div style={{ fontSize:10, color:C.sub }}>{org.name}</div>
                  )}
                </td>
                <td style={s.td}>{org.country === 'BE' ? 'België' : org.country === 'NL' ? 'Nederland' : org.country}</td>
                <td style={s.td}><span style={s.pill(org.plan === 'trial' ? 'amber' : 'green')}>{org.plan}</span></td>
                <td style={s.td}>{org.user_count}/{org.seat_limit}</td>
                <td style={s.td}>{org.contact_count}</td>
                <td style={s.td}><span style={s.pill(org.is_active ? 'green' : 'red')}>{org.is_active ? 'actief' : 'geblokkeerd'}</span></td>
                <td style={s.td}>
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                    <button style={{ ...s.btn, fontSize:10, padding:'3px 8px' }} onClick={() => openEdit(org)}>Bewerk</button>
                    <button style={{ ...s.btn, fontSize:10, padding:'3px 8px' }} onClick={() => toggleActive(org)}>{org.is_active ? 'Blokkeer' : 'Activeer'}</button>
                    {org.plan === 'trial' && <button style={{ ...s.btn, fontSize:10, padding:'3px 8px' }} onClick={() => extendTrial(org)}>+7d trial</button>}
                    <button style={{ ...s.btnD, fontSize:10, padding:'3px 8px' }} onClick={() => deleteOrg(org)}>🗑 Verwijder alles</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )
  }

  // ── Users Tab ─────────────────────────────
  function UsersTab() {
    const [showForm, setShowForm] = useState(false)
    const [form, setForm] = useState({ email:'', password:'', full_name:'', role:'agent', org_id:'' })
    const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))
    const inp = { padding:'6px 10px', borderRadius:6, border:`0.5px solid ${C.bdr}`, background:C.bg, color:C.txt, fontSize:12, width:'100%' }
    const lbl = { fontSize:10, color:C.sub, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3 }

    async function handleInvite() {
      if (!form.org_id) return alert('Kies een bedrijf')
      try {
        await api.post('/platform/users/invite', form)
        setShowForm(false)
        setForm({ email:'', password:'', full_name:'', role:'agent', org_id:'' })
        loadAll()
      } catch (e) { alert(e.message) }
    }

    async function toggleActive(u) {
      try {
        await api.put(`/platform/users/${u.id}`, { is_active: !u.is_active })
        loadAll()
      } catch (e) { alert(e.message) }
    }

    async function changeRole(u, role) {
      try {
        await api.put(`/platform/users/${u.id}`, { role })
        loadAll()
      } catch (e) { alert(e.message) }
    }

    async function togglePlatformAdmin(u) {
      try {
        await api.put(`/platform/users/${u.id}`, { is_platform_admin: !u.is_platform_admin })
        loadAll()
      } catch (e) { alert(e.message) }
    }

    return (
      <>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:500 }}>Gebruikers</div>
          <button style={s.btnP} onClick={() => setShowForm(!showForm)}>+ Nieuwe gebruiker</button>
        </div>

        {showForm && (
          <div style={{ background:C.card, border:`0.5px solid ${C.bdr}`, borderRadius:10, padding:20, marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:500, marginBottom:14 }}>Nieuwe gebruiker uitnodigen</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div><div style={lbl}>Volledige naam</div><input style={inp} value={form.full_name} onChange={f('full_name')} placeholder="Jan De Smet"/></div>
              <div><div style={lbl}>E-mailadres</div><input style={inp} type="email" value={form.email} onChange={f('email')} placeholder="jan@bedrijf.be"/></div>
              <div><div style={lbl}>Wachtwoord</div><input style={inp} type="password" value={form.password} onChange={f('password')} placeholder="Min. 8 tekens" minLength={8}/></div>
              <div><div style={lbl}>Rol</div>
                <select style={inp} value={form.role} onChange={f('role')}>
                  <option value="agent">Agent</option><option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option><option value="client">Client</option>
                </select>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <div style={lbl}>Bedrijf *</div>
                <select style={inp} value={form.org_id} onChange={f('org_id')}>
                  <option value="">— Kies een bedrijf —</option>
                  {orgs.map(o => (
                    <option key={o.id} value={o.id}>{o.display_name || o.name} ({o.country})</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginTop:14, justifyContent:'flex-end' }}>
              <button style={s.btn} onClick={() => setShowForm(false)}>Annuleren</button>
              <button style={s.btnP} onClick={handleInvite} disabled={!form.email || !form.full_name || !form.org_id || !form.password}>Uitnodigen</button>
            </div>
          </div>
        )}

        <table style={s.tbl}>
          <thead><tr>
            <th style={s.th}>Naam</th>
            <th style={s.th}>Bedrijf</th>
            <th style={s.th}>Rol</th>
            <th style={s.th}>Status</th>
            <th style={s.th}>Platform admin</th>
            <th style={s.th}>Acties</th>
          </tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={s.td}><div style={{ fontWeight:500 }}>{u.full_name}</div></td>
                <td style={s.td}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    {u.organizations?.logo_url ? (
                      <img src={u.organizations.logo_url} alt="" style={{ height:16, maxWidth:40, objectFit:'contain' }}/>
                    ) : (
                      <div style={{ width:14, height:14, borderRadius:3, background: u.organizations?.primary_color || '#1d6fb8', flexShrink:0 }}/>
                    )}
                    <span style={{ fontSize:11 }}>{u.organizations?.display_name || u.organizations?.name || '—'}</span>
                  </div>
                </td>
                <td style={s.td}>
                  <select value={u.role} onChange={(e) => changeRole(u, e.target.value)}
                    style={{ padding:'2px 6px', borderRadius:4, border:`0.5px solid ${C.bdr}`, background:C.bg, color:C.txt, fontSize:11 }}>
                    <option value="agent">agent</option><option value="supervisor">supervisor</option>
                    <option value="admin">admin</option><option value="client">client</option>
                  </select>
                </td>
                <td style={s.td}><span style={s.pill(u.is_active ? 'green' : 'red')}>{u.is_active ? 'actief' : 'inactief'}</span></td>
                <td style={s.td}>
                  <input type="checkbox" checked={u.is_platform_admin || false} onChange={() => togglePlatformAdmin(u)}/>
                </td>
                <td style={s.td}>
                  <button style={{ ...s.btn, fontSize:10, padding:'3px 8px' }} onClick={() => toggleActive(u)}>
                    {u.is_active ? 'Deactiveer' : 'Activeer'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.logo}>
          <div style={s.sq}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polygon points="6,1 11,10 1,10" fill="white" opacity="0.9"/></svg>
          </div>
          SolarFlow Pro — Platform
        </div>
        <div style={s.info}>
          <span>{user?.full_name}</span>
          <button style={s.btn} onClick={logout}>Uitloggen</button>
        </div>
      </div>

      <div style={s.tabs}>
        {TABS.map(t => <button key={t} style={s.tab(tab === t)} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      <div style={s.body}>
        {loading ? <div style={{ color:C.sub }}>Laden…</div> : (
          <>
            {tab === 'Overzicht'   && <Overview />}
            {tab === 'Bedrijven'   && <OrgsTab />}
            {tab === 'Gebruikers'  && <UsersTab />}
          </>
        )}
      </div>
    </div>
  )
}
