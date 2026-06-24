// client/src/components/charts/ErrorRateChart.jsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import styles from './Chart.module.css'

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ErrorRateChart({ data, errorRate }) {
  const formatted = (data || []).map(p => ({
    time: formatTime(p.timestamp),
    errors: p.count,
  }))

  return (
    <div className={styles.card}>
      <h3 className={styles.heading}>
        Error Rate
        <span className={styles.badge} style={{ color: errorRate > 5 ? 'var(--danger)' : 'var(--success)' }}>
          {errorRate?.toFixed(2)}%
        </span>
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={formatted} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
          <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3e', borderRadius: 8 }}
            labelStyle={{ color: '#e2e8f0' }}
            itemStyle={{ color: '#ef4444' }}
          />
          <ReferenceLine y={5} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '5%', fill: '#ef4444', fontSize: 10 }} />
          <Line type="monotone" dataKey="errors" stroke="#ef4444" strokeWidth={2} dot={false} name="Errors" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}