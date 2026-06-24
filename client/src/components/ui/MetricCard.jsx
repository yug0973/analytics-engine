// client/src/components/ui/MetricCard.jsx
import styles from './MetricCard.module.css'

export default function MetricCard({ label, value, sub, color }) {
  return (
    <div className={styles.card}>
      <p className={styles.label}>{label}</p>
      <p className={styles.value} style={color ? { color } : {}}>
        {value ?? '—'}
      </p>
      {sub && <p className={styles.sub}>{sub}</p>}
    </div>
  )
}
