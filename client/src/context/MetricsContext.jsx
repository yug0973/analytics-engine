// client/src/context/MetricsContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { analyticsAPI } from '../api/endpoints'
import { getSocket } from '../socket/socketClient'
import { useAuth } from './AuthContext'

const MetricsContext = createContext(null)

export function MetricsProvider({ children }) {
  const { user } = useAuth()
  const [summary, setSummary]         = useState(null)
  const [timeSeries, setTimeSeries]   = useState([])
  const [liveRate, setLiveRate]       = useState(0)
  const [alerts, setAlerts]           = useState([])
  const [period, setPeriod]           = useState('24h')
  const [loading, setLoading]         = useState(false)

  const tenantId = user?.id

  const fetchMetrics = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const [summaryRes, tsRes, liveRes] = await Promise.all([
        analyticsAPI.summary({ tenantId, period }),
        analyticsAPI.timeSeries({ tenantId, period }),
        analyticsAPI.live({ tenantId }),
      ])
      setSummary(summaryRes.data.data)
      setTimeSeries(tsRes.data.data?.dataPoints || [])
      setLiveRate(liveRes.data.data?.eventsPerMinute || 0)
    } catch (err) {
      console.error('[metrics] Fetch failed:', err.message)
    } finally {
      setLoading(false)
    }
  }, [tenantId, period])

  // Initial fetch + poll every 30s
  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 30000)
    return () => clearInterval(interval)
  }, [fetchMetrics])

  // WebSocket live updates
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    const onLive = (data) => setLiveRate(data.eventsPerMinute ?? 0)
    const onAlert = (data) => {
      setAlerts(prev => [data, ...prev].slice(0, 50))
    }

    socket.on('metrics:live', onLive)
    socket.on('alert:triggered', onAlert)

    return () => {
      socket.off('metrics:live', onLive)
      socket.off('alert:triggered', onAlert)
    }
  }, [user])

  return (
    <MetricsContext.Provider value={{
      summary, timeSeries, liveRate, alerts,
      period, setPeriod, loading, fetchMetrics,
    }}>
      {children}
    </MetricsContext.Provider>
  )
}

export const useMetrics = () => useContext(MetricsContext)
