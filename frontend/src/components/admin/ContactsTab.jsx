// frontend/src/components/admin/ContactsTab.jsx
import { useState, useEffect, useRef } from 'react'
import { api } from '../../hooks/api'

export default function ContactsTab() {
  const [campaigns, setCampaigns] = useState([])
  const [selectedCampaign, setSelectedCampaign] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => { loadCampaigns() }, [])

  async function loadCampaigns() {
    try {
      const res = await api.get('/campaigns')
      setCampaigns(res.campaigns || [])
      if (res.campaigns?.length > 0) setSelectedCampaign(res.campaigns[0].id)
    } catch (e) {
      setError('Kan campagnes niet laden')
    }
  }

  async function handleUpload(file) {
    if (!file) return
    if (!selectedCampaign) { setError('Selecteer eerst een campagne'); return }

    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!['.csv', '.xlsx', '.xls'].includes(ext)) {
      setError('Ongeldig bestandstype. Gebruik .csv, .xlsx of .xls'); return
    }

    setUploading(true)
    setError('')
    setImportResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('campaign_id', selectedCampaign)

      const session = localStorage.getItem('sfp_session')
      const token = session ? JSON.parse(session).access_token : null
      const BASE_URL = import.meta.env.VITE_API_URL || '/api'

      const res = await fetch(`${BASE_URL}/contacts/import`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Import mislukt')
      setImportResult(data)
    } catch (e) {
      setError(e.message || 'Import mislukt')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleClear() {
    if (!selectedCampaign) { setError('Selecteer eerst een campagne'); return }
    const camp = campaigns.find(c => c.id === selectedCampaign)
    if (!confirm(
      `Alle contacten in "${camp?.name}" PERMANENT verwijderen?\n\n` +
      `Dit kan niet ongedaan worden gemaakt. U kunt daarna opnieuw importeren.`
    )) return

    setClearing(true)
    setError('')
    try {
      const res = await api.delete(`/contacts/clear-campaign/${selectedCampaign}`)
      setImportResult({
        message: `✅ ${res.deleted_count} contacten verwijderd. U kunt nu opnieuw importeren.`,
        stats: { imported: 0, skipped_duplicate: 0, skipped_dnc: 0, skipped_no_phone: 0, errors: 0, total_rows: res.deleted_count }
      })
    } catch (e) {
      setError(e.message || 'Verwijderen mislukt')
    } finally {
      setClearing(false)
    }
  }

  async function handleReset() {
    if (!selectedCampaign) { setError('Selecteer eerst een campagne'); return }
    const camp = campaigns.find(c => c.id === selectedCampaign)
    if (!confirm(
      `Alle contacten in "${camp?.name}" resetten naar "beschikbaar"?\n\n` +
      `Dit wist de belhistorie NIET — het zet alleen de status terug zodat agenten ze opnieuw kunnen bellen.`
    )) return

    setResetting(true)
    setError('')
    try {
      const res = await api.post(`/contacts/reset-campaign`, { campaign_id: selectedCampaign })
      setImportResult({
        message: `✅ ${res.reset_count} contacten gereset naar "beschikbaar".`,
        stats: { imported: 0, skipped_duplicate: 0, skipped_dnc: 0, skipped_no_phone: 0, errors: 0, total_rows: res.reset_count }
      })
    } catch (e) {
      setError(e.message || 'Reset mislukt')
    } finally {
      setResetting(false)
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  const campaignName = campaigns.find(c => c.id === selectedCampaign)?.name || ''

  const s = {
    card:     { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden' },
    hdr:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '0.5px solid var(--color-border-tertiary)' },
    title:    { fontSize: 16, fontWeight: 500 },
    body:     { padding: 20 },
    selWrap:  { marginBottom: 16 },
    selLabel: { fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 },
    select:   { padding: '8px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 7, fontSize: 13, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', width: '100%', maxWidth: 360 },
    dropzone: {
      border: `2px dashed ${dragOver ? '#3b82f6' : 'var(--color-border-secondary)'}`,
      borderRadius: 12, padding: '36px 20px', textAlign: 'center', cursor: 'pointer',
      transition: 'all 0.15s ease',
      background: dragOver ? 'var(--color-background-info)' : 'var(--color-background-secondary)',
      marginBottom: 12,
    },
    dropIcon: { fontSize: 32, marginBottom: 8, opacity: 0.5 },
    dropText: { fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500, marginBottom: 4 },
    dropSub:  { fontSize: 11, color: 'var(--color-text-secondary)' },
    dropBtn:  { display: 'inline-block', marginTop: 10, padding: '7px 16px', borderRadius: 7, background: '#1d6fb8', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', fontWeight: 500 },
    resetBar: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--color-background-warning)', borderRadius: 8, marginBottom: 8, fontSize: 12 },
    resetBtn: { padding: '6px 14px', borderRadius: 7, background: '#92400e', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', fontWeight: 500, flexShrink: 0 },
    clearBar: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--color-background-danger)', borderRadius: 8, marginBottom: 16, fontSize: 12 },
    clearBtn: { padding: '6px 14px', borderRadius: 7, background: '#b91c1c', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', fontWeight: 500, flexShrink: 0 },
    progress: { padding: '16px 20px', background: 'var(--color-background-info)', borderRadius: 8, fontSize: 12, color: 'var(--color-text-info)', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 },
    spinner:  { width: 16, height: 16, border: '2px solid var(--color-border-info)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
    results:  { background: 'var(--color-background-secondary)', borderRadius: 8, padding: 16, marginBottom: 16 },
    resTitle: { fontSize: 13, fontWeight: 500, marginBottom: 10 },
    resGrid:  { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 },
    resStat:  { background: 'var(--color-background-primary)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' },
    resNum:   (color) => ({ fontSize: 22, fontWeight: 600, color, lineHeight: 1.2 }),
    resLabel: { fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 2 },
    resMsg:   { marginTop: 10, fontSize: 12, color: 'var(--color-text-success)', background: 'var(--color-background-success)', padding: '8px 12px', borderRadius: 7 },
    err:      { background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', borderRadius: 7, padding: '8px 12px', fontSize: 12, marginBottom: 12 },
    guide:    { marginTop: 8, background: 'var(--color-background-secondary)', borderRadius: 8, padding: 14 },
    guideT:   { fontSize: 12, fontWeight: 500, marginBottom: 8 },
    guideRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
    guideTag: { padding: '3px 8px', borderRadius: 5, fontSize: 10, background: 'var(--color-background-primary)', color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border-tertiary)' },
  }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={s.card}>
        <div style={s.hdr}>
          <div style={s.title}>Contacten importeren</div>
        </div>

        <div style={s.body}>
          {error && <div style={s.err}>{error}</div>}

          {/* Campaign selector */}
          <div style={s.selWrap}>
            <div style={s.selLabel}>Selecteer campagne</div>
            <select style={s.select} value={selectedCampaign} onChange={(e) => setSelectedCampaign(e.target.value)}>
              {campaigns.length === 0 && <option value="">Geen campagnes — maak er eerst een aan</option>}
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
              ))}
            </select>
          </div>

          {/* Reset bar */}
          <div style={s.resetBar}>
            <div style={{ flex: 1, color: 'var(--color-text-warning)' }}>
              <strong>Opnieuw bellen?</strong> Reset alle contacten naar "beschikbaar" zonder ze te verwijderen.
            </div>
            <button
              style={s.resetBtn}
              onClick={handleReset}
              disabled={resetting || !selectedCampaign}
            >
              {resetting ? 'Bezig…' : '🔄 Reset contacten'}
            </button>
          </div>

          {/* Clear bar */}
          <div style={s.clearBar}>
            <div style={{ flex: 1, color: 'var(--color-text-danger)' }}>
              <strong>Nieuwe import?</strong> Verwijder alle contacten uit deze campagne permanent zodat u opnieuw kunt importeren.
            </div>
            <button
              style={s.clearBtn}
              onClick={handleClear}
              disabled={clearing || !selectedCampaign}
            >
              {clearing ? 'Bezig…' : '🗑 Verwijder contacten'}
            </button>
          </div>

          {/* Drop zone */}
          {uploading ? (
            <div style={s.progress}>
              <div style={s.spinner} />
              Bezig met importeren… Dit kan even duren bij grote bestanden.
            </div>
          ) : (
            <div
              style={s.dropzone}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false) }}
              onClick={() => fileRef.current?.click()}
            >
              <div style={s.dropIcon}>📄</div>
              <div style={s.dropText}>Sleep een CSV of Excel bestand hierheen</div>
              <div style={s.dropSub}>of klik om een bestand te kiezen</div>
              <div style={s.dropSub}>Ondersteunde formaten: .csv, .xlsx, .xls</div>
              <button style={s.dropBtn} onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}>
                Bestand kiezen
              </button>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} style={{ display: 'none' }} />
            </div>
          )}

          {/* Results */}
          {importResult && (
            <div style={s.results}>
              <div style={s.resTitle}>Resultaat — {campaignName}</div>
              <div style={s.resGrid}>
                <div style={s.resStat}><div style={s.resNum('#22c55e')}>{importResult.stats?.imported || 0}</div><div style={s.resLabel}>Geïmporteerd</div></div>
                <div style={s.resStat}><div style={s.resNum('var(--color-text-warning)')}>{importResult.stats?.skipped_duplicate || 0}</div><div style={s.resLabel}>Duplicaten</div></div>
                <div style={s.resStat}><div style={s.resNum('var(--color-text-danger)')}>{importResult.stats?.skipped_dnc || 0}</div><div style={s.resLabel}>DNC</div></div>
                <div style={s.resStat}><div style={s.resNum('var(--color-text-secondary)')}>{importResult.stats?.skipped_no_phone || 0}</div><div style={s.resLabel}>Geen telefoon</div></div>
                <div style={s.resStat}><div style={s.resNum('var(--color-text-danger)')}>{importResult.stats?.errors || 0}</div><div style={s.resLabel}>Fouten</div></div>
                <div style={s.resStat}><div style={s.resNum('var(--color-text-primary)')}>{importResult.stats?.total_rows || 0}</div><div style={s.resLabel}>Totaal</div></div>
              </div>
              {importResult.message && <div style={s.resMsg}>{importResult.message}</div>}
            </div>
          )}

          {/* Column guide */}
          <div style={s.guide}>
            <div style={s.guideT}>Verwachte kolommen (flexibel — Nederlandse namen worden herkend)</div>
            <div style={s.guideRow}>
              {['first_name / voornaam','last_name / achternaam','phone / telefoon / gsm','email','street / straat','city / stad','postal_code / postcode','lead_score / score'].map(col => (
                <span key={col} style={s.guideTag}>{col}</span>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8, lineHeight: 1.5 }}>
              Het adres uit het bestand is <strong>niet zichtbaar voor agenten</strong>. Agenten vragen het adres tijdens het gesprek.
              Duplicaten en DNC-nummers worden automatisch overgeslagen.
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
