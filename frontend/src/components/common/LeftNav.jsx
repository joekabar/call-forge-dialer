import { useNavigate, useLocation } from 'react-router-dom'
import { useAgentStore } from '../../store/agentStore'

const NAV_ITEMS = [
  { icon: 'grid',      path: '/workspace',       roles: ['agent','supervisor','admin'] },
  { icon: 'contacts',  path: '/admin/contacts',  roles: ['admin','supervisor'] },
  { icon: 'campaigns', path: '/admin/campaigns', roles: ['admin','supervisor'] },
  { icon: 'reports',   path: '/admin/reports',   roles: ['admin','supervisor','client'] },
  { icon: 'settings',  path: '/admin/settings',  roles: ['admin'] },
]

export default function LeftNav() {
  const { user }     = useAgentStore()
  const navigate     = useNavigate()
  const { pathname } = useLocation()

  const s = {
    nav:  { width: 48, background: 'var(--color-background-primary)', borderRight: '0.5px solid var(--color-border-tertiary)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0', gap: 2, flexShrink: 0 },
    item: (active) => ({ width: 34, height: 34, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: active ? 'var(--color-text-info)' : 'var(--color-text-secondary)', background: active ? 'var(--color-background-info)' : 'transparent' }),
  }

  const visible = NAV_ITEMS.filter(i => i.roles.includes(user?.role))

  return (
    <div style={s.nav}>
      {visible.map(item => (
        <div key={item.path} style={s.item(pathname.startsWith(item.path))} onClick={() => navigate(item.path)}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            {item.icon === 'grid'      && <><rect x="1" y="1" width="5" height="5" rx="1.5" fill="currentColor"/><rect x="9" y="1" width="5" height="5" rx="1.5" fill="currentColor" opacity=".4"/><rect x="1" y="9" width="5" height="5" rx="1.5" fill="currentColor" opacity=".4"/><rect x="9" y="9" width="5" height="5" rx="1.5" fill="currentColor" opacity=".4"/></>}
            {item.icon === 'contacts'  && <><circle cx="7" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" fill="none"/><path d="M2 13c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none"/></>}
            {item.icon === 'campaigns' && <path d="M2 7h10M2 4h7M2 10h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>}
            {item.icon === 'reports'   && <><rect x="2" y="9" width="2.5" height="4" rx="1" fill="currentColor" opacity=".4"/><rect x="6.5" y="5" width="2.5" height="8" rx="1" fill="currentColor" opacity=".7"/><rect x="11" y="1" width="2.5" height="12" rx="1" fill="currentColor"/></>}
            {item.icon === 'settings'  && <><circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.4" fill="none"/><path d="M7 1v2M7 11v2M1 7h2M11 7h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></>}
          </svg>
        </div>
      ))}
    </div>
  )
}