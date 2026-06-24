// client/src/pages/Dashboard.jsx
import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'
import MetricCard from '../components/ui/MetricCard'
import EventVolumeChart from '../components/charts/EventVolumeChart'
import EventTypeBreakdown from '../components/charts/EventTypeBreakdown'
import ErrorRateChart from '../components/charts/ErrorRateChart'
import AlertBadge from '../components/ui/AlertBadge'
import { useMetrics } from '../context/MetricsContext'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const { summary, timeSeries, liveRate, alerts, loading } = useMetrics()

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <Topbar title="Dashboard" />
        <div className={styles.content}>
          {loading && !summary && (
            <p className={styles.loading}>Loading metrics…</p>
          )}

          {/* ── Metric cards ── */}
          <div className={styles.cards}>
            <MetricCard
              label="Total Events"
              value={summary?.totalEvents?.toLocaleString() ?? '—'}
              sub="in selected period"
            />
            <MetricCard
              label="Unique Users"
              value={summary?.uniqueUsers?.toLocaleString() ?? '—'}
              sub="distinct user IDs"
            />
            <MetricCard
              label="Sessions"
              value={summary?.uniqueSessions?.toLocaleString() ?? '—'}
              sub="unique sessions"
            />
            <MetricCard
              label="Live Rate"
              value={liveRate}
              sub="events / minute"
              color="var(--primary)"
            />
            <MetricCard
              label="Error Rate"
              value={summary ? `${summary.errorRate}%` : '—'}
              sub={`${summary?.errorCount ?? 0} errors`}
              color={summary?.errorRate > 5 ? 'var(--danger)' : 'var(--success)'}
            />
          </div>

          {/* ── Charts ── */}
          <div className={styles.charts}>
            <EventVolumeChart data={timeSeries} />
            <EventTypeBreakdown data={summary?.topEventTypes} />
          </div>

          <div className={styles.chartsWide}>
            <ErrorRateChart data={timeSeries} errorRate={summary?.errorRate} />
          </div>

          {/* ── Recent alerts ── */}
          {alerts.length > 0 && (
            <div className={styles.alertsSection}>
              <h2 className={styles.sectionTitle}>Recent Alerts</h2>
              <div className={styles.alertsList}>
                {alerts.slice(0, 5).map((a, i) => (
                  <AlertBadge key={i} alert={a} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}