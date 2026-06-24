// client/src/components/ui/LiveTicker.jsx
import { useSocketStatus } from '../../hooks/useSocket'
import styles from './LiveTicker.module.css'

export default function LiveTicker({ value }) {
  const connected = useSocketStatus()

  return (
    <div className={styles.ticker}>
      <span className={`${styles.dot} ${connected ? styles.live : styles.off}`} />
      <span className={styles.label}>
        {connected ? 'Live' : 'Offline'}
      </span>
      <span className={styles.value}>{value} <span className={styles.unit}>evt/min</span></span>
    </div>
  )
}
