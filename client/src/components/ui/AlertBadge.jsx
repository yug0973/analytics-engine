// client/src/components/ui/AlertBadge.jsx
import styles from './AlertBadge.module.css'

export default function AlertBadge({ alert }) {
  return (
    <div className={styles.badge}>
      <span className={styles.icon}>⚠</span>
      <div className={styles.body}>
        <p className={styles.name}>{alert.ruleName}</p>
        <p className={styles.detail}>
          {alert.metricName} {alert.operator} {alert.threshold} — current: <strong>{alert.value?.toFixed(2)}</strong>
        </p>
        <p className={styles.time}>{new Date(alert.triggeredAt || alert.timestamp).toLocaleTimeString()}</p>
      </div>
    </div>
  )
}
