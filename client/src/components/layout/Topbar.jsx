// client/src/components/layout/Topbar.jsx
import LiveTicker from '../ui/LiveTicker'
import { useMetrics } from '../../context/MetricsContext'
import styles from './Topbar.module.css'

const PERIODS = ['1h', '24h', '7d', '30d']

export default function Topbar({ title }) {
  const { liveRate, period, setPeriod } = useMetrics()

  return (
    <header className={styles.topbar}>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.right}>
        <div className={styles.periods}>
          {PERIODS.map(p => (
            <button
              key={p}
              className={`${styles.period} ${period === p ? styles.active : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <LiveTicker value={liveRate} />
      </div>
    </header>
  )
}
