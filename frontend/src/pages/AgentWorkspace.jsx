// frontend/src/pages/AgentWorkspace.jsx
// ────────────────────────────────────────
// The main agent screen with campaign selector.
// Agent picks a campaign → contacts load from that campaign.

import { useState, useEffect, useRef } from 'react'
import { useAgentStore }    from '../store/agentStore'
import { useCallStore }     from '../store/callStore'
import { useCampaignStore } from '../store/campaignStore'
import { api }              from '../hooks/api'
import TopBar      from '../components/common/TopBar'
import LeftNav     from '../components/common/LeftNav'
import StatusBar   from '../components/common/StatusBar'
import TrialBanner from '../components/common/TrialBanner'
import MapTab         from '../components/tabs/MapTab'
import PhoneTab       from '../components/tabs/PhoneTab'
import ContactFormTab from '../components/tabs/ContactFormTab'
import AgendaTab      from '../components/tabs/AgendaTab'

const TABS = [
  { id: 'map',    label: 'Map view' },
  { id: 'phone',  label: 'Phone' },
  { id: 'form',   label: 'Contact form' },
  { id: 'agenda', label: 'Agenda' },
]

export default function AgentWorkspace() {
  const [activeTab, setActiveTab]         = useState('map')
  const [activeCampaigns, setActiveCampaigns] = useState([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(true)
  const { user }                          = useAgentStore()
  const { contact, callStatus, tickDuration } = useCallStore()
  const { campaign, setCampaign }         = useCampaignStore()
  const timerRef = useRef(null)

  // ── Load active campaigns on mount ────────────────────────
  useEffect(() => {
    async function load() {
      setLoadingCampaigns(true)
      try {
        const res = await api.get('/campaigns/active')
        const camps = res.campaigns || []
        setActiveCampaigns(camps)
        // Auto-select first campaign if none selected
        if (!campaign && camps.length > 0) {
          setCampaign(camps[0])
        }
      } catch (e) {
        console.error('Failed to load campaigns:', e)
      } finally {
        setLoadingCampaigns(false)
      }
    }
    load()
  }, [])

  function handleCampaignChange(campaignId) {
    const selected = activeCampaigns.find(c => c.id === campaignId)
    if (selected) {
      setCampaign(selected)
    }
  }

  // Call duration timer
  useEffect(() => {
    if (callStatus === 'active') {
      timerRef.current = setInterval(tickDuration, 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [callStatus, tickDuration])

  useEffect(() => {
    if (callStatus === 'active') setActiveTab('phone')
  }, [callStatus])

  const s = {
    wrap:    { display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--color-background-tertiary)', overflow: 'hidden' },
    body:    { display: 'flex', flex: 1, overflow: 'hidden' },
    main:    { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
    tabs:    { display: 'flex', alignItems: 'center', borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-primary)', padding: '0 12px', flexShrink: 0, overflowX: 'auto' },
    tab:     (active) => ({
               padding: '9px 14px', fontSize: '12px', cursor: 'pointer',
               borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
               color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
               fontWeight: active ? '500' : '400', whiteSpace: 'nowrap',
             }),
    content: { flex: 1, overflow: 'hidden' },
    campBar: {
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 14px',
      background: 'var(--color-background-primary)',
      borderBottom: '0.5px solid var(--color-border-tertiary)',
      flexShrink: 0,
    },
    campLabel: { fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' },
    campSelect: {
      padding: '5px 8px', borderRadius: 6,
      border: '0.5px solid var(--color-border-secondary)',
      background: 'var(--color-background-primary)',
      color: 'var(--color-text-primary)',
      fontSize: 12, cursor: 'pointer', minWidth: 200,
    },
    campInfo: { fontSize: 10, color: 'var(--color-text-tertiary)', display: 'flex', gap: 8 },
    campDot: { width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0, marginTop: 2 },
    noCamp: {
      margin: 12, padding: '12px 16px',
      background: 'var(--color-background-warning)',
      color: 'var(--color-text-warning)',
      borderRadius: 8, fontSize: 12,
    },
  }

  return (
    <div style={s.wrap}>
      <TrialBanner daysRemaining={user?.trial_days_remaining} />
      <TopBar />

      {/* Campaign selector bar */}
      <div style={s.campBar}>
        <span style={s.campLabel}>Campagne:</span>
        {loadingCampaigns ? (
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Laden…</span>
        ) : activeCampaigns.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--color-text-warning)' }}>Geen actieve campagnes</span>
        ) : (
          <>
            <select
              style={s.campSelect}
              value={campaign?.id || ''}
              onChange={(e) => handleCampaignChange(e.target.value)}
            >
              {activeCampaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {campaign && (
              <div style={s.campInfo}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <div style={s.campDot} />
                  <span>{campaign.country}</span>
                </div>
                <span>
                  {campaign.contact_interval_sec === 0
                    ? 'Geen limiet'
                    : `${Math.round(3600 / campaign.contact_interval_sec)}/uur`}
                </span>
                <span>{campaign.calling_hours_start?.slice(0,5)} – {campaign.calling_hours_end?.slice(0,5)}</span>
              </div>
            )}
          </>
        )}
      </div>

      {activeCampaigns.length === 0 && !loadingCampaigns && (
        <div style={s.noCamp}>
          Geen actieve campagnes gevonden. Vraag je beheerder om een campagne aan te maken en te activeren.
        </div>
      )}

      <div style={s.body}>
        <LeftNav />
        <div style={s.main}>
          <div style={s.tabs}>
            {TABS.map(t => (
              <div
                key={t.id}
                style={s.tab(activeTab === t.id)}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
                {t.id === 'phone' && callStatus === 'active' && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', marginLeft: 6, verticalAlign: 'middle' }} />
                )}
              </div>
            ))}
          </div>
          <div style={s.content}>
            {activeTab === 'map'    && <MapTab />}
            {activeTab === 'phone'  && <PhoneTab />}
            {activeTab === 'form'   && <ContactFormTab />}
            {activeTab === 'agenda' && <AgendaTab />}
          </div>
        </div>
      </div>

      <StatusBar />
    </div>
  )
}
