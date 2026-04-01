// frontend/src/components/admin/UsersTab.jsx
// ──────────────────────────────────────────────
// User management for admin panel.
// Invite agents, set roles, deactivate users.

import { useState, useEffect } from 'react'
import { api } from '../../hooks/api'

const ROLES = [
  { value: 'agent',      label: 'Agent',      desc: 'Belt contacten, volgt script' },
  { value: 'supervisor', label: 'Supervisor',  desc: 'Bekijkt rapporten, beheert campagnes' },
  { value: 'admin',      label: 'Admin',       desc: 'Volledige toegang' },
]

const ROLE_COLORS = {
  admin:      { bg: 'var(--color-background-info)', color: 'var(--color-text-info)' },
  supervisor: { bg: 'var(--color-background-warning)', color: 'var(--color-text-warning)' },
  agent:      { bg: 'var(--color-background-success)', color: 'var(--color-text-success)' },
}

export default function UsersTab() {
  const [users, setUsers]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')
  const [form, setForm] = useState({
    email: '', password: '', full_name: '', role: 'agent',
  })

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      const res = await api.get('/users')
      setUsers(res.users || [])
    } catch (e) {
      setError('Kan gebruikers niet laden')
    } finally {
      setLoading(false)
    }
  }

  function openInvite() {
    setForm({ email: '', password: '', full_name: '', role: 'agent' })
    setShowInvite(true)
    setError('')
    setSuccess('')
  }

  async function handleInvite() {
    if (!form.full_name.trim()) { setError('Naam is verplicht'); return }
    if (!form.email.trim()) { setError('E-mail is verplicht'); return }
    if (!form.password || form.password.length < 8) { setError('Wachtwoord moet minimaal 8 tekens zijn'); return }
    setError('')
    setSuccess('')

    try {
      const res = await api.post('/users/invite', {
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        role: form.role,
      })
      setSuccess(res.message || 'Gebruiker uitgenodigd!')
      setShowInvite(false)
      await loadUsers()
    } catch (e) {
      setError(e.message || 'Uitnodigen mislukt')
    }
  }

  async function handleRoleChange(userId, newRole) {
    setError('')
    try {
      await api.put(`/users/${userId}`, { role: newRole })
      await loadUsers()
    } catch (e) {
      setError(e.message || 'Rol wijzigen mislukt')
    }
  }

  async function handleToggleActive(user) {
    setError('')
    const newActive = !user.is_active
    const action = newActive ? 'activeren' : 'deactiveren'
    if (!newActive && !confirm(`${user.full_name} ${action}? Deze persoon kan niet meer inloggen.`)) return

    try {
      await api.put(`/users/${user.id}`, { is_active: newActive })
      await loadUsers()
    } catch (e) {
      setError(e.message || `${action} mislukt`)
    }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const s = {
    card:  { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden' },
    hdr:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '0.5px solid var(--color-border-tertiary)' },
    title: { fontSize: 16, fontWeight: 500 },
    btnP:  { padding: '7px 14px', borderRadius: 7, background: '#1d6fb8', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', fontWeight: 500 },
    btn:   { padding: '5px 10px', borderRadius: 6, border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontSize: 11, cursor: 'pointer' },
    btnD:  { padding: '5px 10px', borderRadius: 6, border: '0.5px solid var(--color-border-danger)', background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', fontSize: 11, cursor: 'pointer' },
    btnG:  { padding: '5px 10px', borderRadius: 6, border: '0.5px solid var(--color-border-success)', background: 'var(--color-background-success)', color: 'var(--color-text-success)', fontSize: 11, cursor: 'pointer' },
    row:   { display: 'grid', gridTemplateColumns: '1fr 100px 140px 120px', alignItems: 'center', padding: '12px 20px', borderBottom: '0.5px solid var(--color-border-tertiary)', gap: 12 },
    rowH:  { display: 'grid', gridTemplateColumns: '1fr 100px 140px 120px', padding: '8px 20px', borderBottom: '0.5px solid var(--color-border-tertiary)', gap: 12, background: 'var(--color-background-secondary)' },
    th:    { fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.06em' },
    name:  { fontSize: 13, fontWeight: 500 },
    sub:   { fontSize: 11, color: 'var(--color-text-secondary)' },
    inactive: { opacity: 0.5 },
    badge: (role) => {
      const c = ROLE_COLORS[role] || ROLE_COLORS.agent
      return { display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: c.bg, color: c.color }
    },
    statusDot: (active) => ({ width: 7, height: 7, borderRadius: '50%', background: active ? '#22c55e' : '#c53030', flexShrink: 0 }),
    actions: { display: 'flex', gap: 4, flexWrap: 'wrap' },
    empty: { padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 },
    err:   { background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', borderRadius: 7, padding: '8px 12px', fontSize: 12, margin: '0 20px 12px' },
    suc:   { background: 'var(--color-background-success)', color: 'var(--color-text-success)', borderRadius: 7, padding: '8px 12px', fontSize: 12, margin: '0 20px 12px' },

    // Modal
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
    modal:   { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', padding: 24, width: '100%', maxWidth: 440 },
    mTitle:  { fontSize: 15, fontWeight: 500, marginBottom: 16 },
    fg:      { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 },
    fl:      { fontSize: 11, color: 'var(--color-text-secondary)' },
    fi:      { padding: '7px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 7, fontSize: 13, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', width: '100%' },
    ffoot:   { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 },
    roleGrid: { display: 'flex', gap: 8, marginBottom: 4 },
    roleOpt: (sel) => ({
      flex: 1, padding: '10px', borderRadius: 7, cursor: 'pointer', textAlign: 'center',
      border: sel ? '1.5px solid #1d6fb8' : '0.5px solid var(--color-border-secondary)',
      background: sel ? 'var(--color-background-info)' : 'var(--color-background-primary)',
    }),
    roleLabel: (sel) => ({ fontSize: 12, fontWeight: sel ? 500 : 400, color: sel ? 'var(--color-text-info)' : 'var(--color-text-primary)' }),
    roleDesc: { fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 2 },
  }

  const formatDate = (d) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <>
      <div style={s.card}>
        <div style={s.hdr}>
          <div style={s.title}>Gebruikers ({users.length})</div>
          <button style={s.btnP} onClick={openInvite}>+ Gebruiker uitnodigen</button>
        </div>

        {error && <div style={s.err}>{error}</div>}
        {success && <div style={s.suc}>{success}</div>}

        {users.length > 0 && (
          <div style={s.rowH}>
            <div style={s.th}>Naam</div>
            <div style={s.th}>Rol</div>
            <div style={s.th}>Status</div>
            <div style={s.th}>Acties</div>
          </div>
        )}

        {loading ? (
          <div style={s.empty}>Laden…</div>
        ) : users.length === 0 ? (
          <div style={s.empty}>Nog geen gebruikers.</div>
        ) : (
          users.map(u => (
            <div key={u.id} style={{ ...s.row, ...(u.is_active ? {} : s.inactive) }}>
              <div>
                <div style={s.name}>{u.full_name || 'Naamloos'}</div>
                <div style={s.sub}>Sinds {formatDate(u.created_at)}</div>
              </div>
              <div>
                <select
                  style={{ ...s.fi, padding: '3px 6px', fontSize: 11 }}
                  value={u.role}
                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                >
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={s.statusDot(u.is_active)} />
                <span style={{ fontSize: 11, color: u.is_active ? 'var(--color-text-success)' : 'var(--color-text-danger)' }}>
                  {u.is_active ? 'Actief' : 'Inactief'}
                </span>
              </div>
              <div style={s.actions}>
                {u.is_active ? (
                  <button style={s.btnD} onClick={() => handleToggleActive(u)}>Deactiveer</button>
                ) : (
                  <button style={s.btnG} onClick={() => handleToggleActive(u)}>Activeer</button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div style={s.overlay} onClick={(e) => e.target === e.currentTarget && setShowInvite(false)}>
          <div style={s.modal}>
            <div style={s.mTitle}>Nieuwe gebruiker uitnodigen</div>

            <div style={s.fg}>
              <div style={s.fl}>Volledige naam *</div>
              <input style={s.fi} value={form.full_name} onChange={set('full_name')} placeholder="bv. Jan Janssen" autoFocus />
            </div>

            <div style={s.fg}>
              <div style={s.fl}>E-mailadres *</div>
              <input style={s.fi} type="email" value={form.email} onChange={set('email')} placeholder="bv. jan@bedrijf.be" />
            </div>

            <div style={s.fg}>
              <div style={s.fl}>Tijdelijk wachtwoord * (gebruiker kan dit later wijzigen)</div>
              <input style={s.fi} type="text" value={form.password} onChange={set('password')} placeholder="Minimaal 8 tekens" />
            </div>

            <div style={s.fg}>
              <div style={s.fl}>Rol</div>
              <div style={s.roleGrid}>
                {ROLES.map(r => (
                  <div
                    key={r.value}
                    style={s.roleOpt(form.role === r.value)}
                    onClick={() => setForm(f => ({ ...f, role: r.value }))}
                  >
                    <div style={s.roleLabel(form.role === r.value)}>{r.label}</div>
                    <div style={s.roleDesc}>{r.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {error && <div style={{ ...s.err, margin: '12px 0 0' }}>{error}</div>}

            <div style={s.ffoot}>
              <button style={s.btn} onClick={() => setShowInvite(false)}>Annuleren</button>
              <button style={s.btnP} onClick={handleInvite}>Uitnodigen</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
