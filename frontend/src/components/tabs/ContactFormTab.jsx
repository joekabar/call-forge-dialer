// frontend/src/components/tabs/ContactFormTab.jsx
// ──────────────────────────────────────────────────
// Contact detail viewer — shows current contact info.
// Outcomes are handled in PhoneTab now.
// This tab shows: contact details, call history, verified address status.

import { useCallStore } from '../../store/callStore'

export default function ContactFormTab() {
  const { contact } = useCallStore()

  const s = {
    wrap: { height: '100%', padding: 12, overflowY: 'auto' },
    card: { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', padding: 16 },
    title: { fontSize: 14, fontWeight: 500, marginBottom: 14 },
    grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
    field: { marginBottom: 10 },
    fl: { fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 },
    fv: { fontSize: 13, color: 'var(--color-text-primary)' },
    badge: (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, background: `var(--color-background-${color})`, color: `var(--color-text-${color})` }),
    empty: { color: 'var(--color-text-secondary)', fontSize: 13, textAlign: 'center', padding: 40 },
    section: { fontSize: 10, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.06em', borderTop: '0.5px solid var(--color-border-tertiary)', paddingTop: 10, marginTop: 10, marginBottom: 8, gridColumn: '1/-1' },
  }

  if (!contact) return (
    <div style={s.wrap}>
      <div style={{ ...s.card, ...s.empty }}>
        Laad een contact via het Telefoon-tabblad.
      </div>
    </div>
  )

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={s.title}>{contact.first_name} {contact.last_name}</div>
          <span style={s.badge(contact.address_verified ? 'success' : 'warning')}>
            {contact.address_verified ? 'Adres geverifieerd' : 'Adres niet geverifieerd'}
          </span>
        </div>

        <div style={s.grid}>
          <div style={s.field}>
            <div style={s.fl}>Telefoon</div>
            <div style={s.fv}>{contact.phone_masked || '—'}</div>
          </div>
          <div style={s.field}>
            <div style={s.fl}>E-mail</div>
            <div style={s.fv}>{contact.email || '—'}</div>
          </div>
          <div style={s.field}>
            <div style={s.fl}>Lead score</div>
            <div style={s.fv}>
              <span style={{ color: 'var(--color-text-success)', fontWeight: 500 }}>{contact.lead_score}</span>
              <span style={{ color: 'var(--color-text-secondary)' }}> / 100</span>
            </div>
          </div>
          <div style={s.field}>
            <div style={s.fl}>Status</div>
            <div style={s.fv}>{contact.status || '—'}</div>
          </div>
          <div style={s.field}>
            <div style={s.fl}>Aantal gesprekken</div>
            <div style={s.fv}>{contact.call_count || 0}</div>
          </div>
          <div style={s.field}>
            <div style={s.fl}>Laatste resultaat</div>
            <div style={s.fv}>{contact.last_outcome?.replace(/_/g, ' ') || '—'}</div>
          </div>

          {/* Verified address section */}
          <div style={s.section}>Geverifieerd adres</div>
          <div style={s.field}>
            <div style={s.fl}>Straat</div>
            <div style={s.fv}>{contact.street_verified || '—'}</div>
          </div>
          <div style={s.field}>
            <div style={s.fl}>Gemeente</div>
            <div style={s.fv}>{contact.city_verified || '—'}</div>
          </div>
          <div style={s.field}>
            <div style={s.fl}>Postcode</div>
            <div style={s.fv}>{contact.postal_code_verified || '—'}</div>
          </div>

          {/* Callback info */}
          {contact.callback_at && (
            <>
              <div style={s.section}>Terugbellen</div>
              <div style={{ ...s.field, gridColumn: '1/-1' }}>
                <div style={s.fl}>Terugbeldatum</div>
                <div style={s.fv}>
                  {new Date(contact.callback_at).toLocaleString('nl-BE', {
                    weekday: 'long', day: 'numeric', month: 'long',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
