// client/src/components/charts/EventTypeBreakdown.jsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import styles from './Chart.module.css'

export default function EventTypeBreakdown({ data }) {
  const formatted = (data || []).map(d => ({ name: d.event_type, count: d.count }))

  return (
    <div className={styles.card}>
      <h3 className={styles.heading}>Top Event Types</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={formatted} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
          <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3e', borderRadius: 8 }}
            labelStyle={{ color: '#e2e8f0' }}
            itemStyle={{ color: '#22c55e' }}
          />
          <Bar dataKey="count" fill="#22c55e" radius={[4,4,0,0]} name="Count" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}