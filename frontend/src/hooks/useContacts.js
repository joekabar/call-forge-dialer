// frontend/src/hooks/useContacts.js
import { useState, useCallback } from 'react'
import { useAgentStore }    from '../store/agentStore'
import { useCallStore }     from '../store/callStore'
import { useCampaignStore } from '../store/campaignStore'
import { api }              from './api'

export function useContacts() {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const { user }                       = useAgentStore()
  const { setContact, clearContact,
          setWaitSeconds, setCallStatus } = useCallStore()
  const { campaign, incrementCalls }   = useCampaignStore()

  const requestNextContact = useCallback(async () => {
    if (!campaign?.id) {
      setError('No campaign selected')
      return
    }

    setLoading(true)
    setError(null)
    setCallStatus('loading')

    try {
      const res = await api.post('/dialer/next-contact', {
        campaign_id: campaign.id,
      })

      if (res.status === 'queue_empty') {
        setCallStatus('idle')
        setError('No more contacts in this campaign right now.')
        return
      }

      setContact(res.contact)
      incrementCalls()

    } catch (err) {
      if (err.status === 429) {
        const wait = Math.ceil(err.detail.wait_seconds)
        setWaitSeconds(wait)
        setCallStatus('idle')
      } else if (err.status === 402) {
        setError('trial_expired')
        setCallStatus('idle')
      } else if (err.status === 403 && err.detail?.error === 'outside_calling_hours') {
        setError(`Outside calling hours (${err.detail.message})`)
        setCallStatus('idle')
      } else {
        setError(err.message || 'Failed to load next contact')
        setCallStatus('idle')
      }
    } finally {
      setLoading(false)
    }
  }, [campaign, setContact, setCallStatus, setWaitSeconds, incrementCalls])

  const completeCall = useCallback(async (payload) => {
    setLoading(true)
    try {
      const res = await api.post('/dialer/complete-call', payload)
      clearContact()
      return res
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [clearContact])

  return { loading, error, requestNextContact, completeCall }
}