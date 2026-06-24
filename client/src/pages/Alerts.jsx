// client/src/pages/Alerts.jsx
import { useState, useEffect } from 'react'
import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'
import AlertBadge from '../components/ui/AlertBadge'
import { alertsAPI } from '../api/endpoints'
import { useMetrics } from '../context/MetricsContext'
import { useAuth } from '../context/AuthContext'
import styles from './Alerts.module.css'

export default function Alerts() {
  const { alerts: liveAlerts } = useMetrics()
  const { user } = useAuth()

  const [rules, setRules]         = useState([])
  const [events, setEvents]       = useState([])
  const [showForm, setShowForm]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [form, setForm] = useState({
    name: '', metricName: 'events_per_minute',
    operator: 'gt', threshold: '', windowSecs: 300, cooldownSecs: 600,
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [rulesRes, eventsRes] = await Promise.all([
        alertsAPI.listRules(),
        alertsAPI.listEvents({ limit: 20 }),
      ])
      setRules(rulesRes.data.data || [])
      setEvents(eventsRes.data.data || [])
    } catch (err) {
      console.error('Failed to load alerts:', err.message)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await alertsAPI.createRule({
        ...form,
        threshold: parseFloat(form.threshold),
        windowSecs: parseInt(form.windowSecs),
        cooldownSecs: parseInt(form.cooldownSecs),
      })
      setShowForm(false)
      setForm({ name: '', metricName: 'events_per_minute', operator: 'gt', threshold: '', windowSecs: 300, cooldownSecs: 600 })
      loadData()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create rule')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this rule?')) return
    try {
      await alertsAPI.deleteRule(id)
      loadData()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete rule')
    }
  }

  async function handleToggle(rule) {
    try {
      await alertsAPI.updateRule(rule.id, { isActive: !rule.is_active })
      loadData()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update rule')
    }
  }

  const canEdit = user?.role === 'admin' || user?.role === 'analyst'

  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <Topbar title="Alerts" />
        <div className={styles.content}>

          {/* Live alerts from WebSocket */}
          {liveAlerts.length > 0 && (
            <section>
              <h2 className={styles.sectionTitle}>Live Alerts</h2>
              <div className={styles.list}>
                {liveAlerts.slice(0, 5).map((a, i) => <AlertBadge key={i} alert={a} />)}
              </div>
            </section>
          )}

          {/* Alert rules */}
          <section>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Alert Rules</h2>
              {canEdit && (
                <button className={styles.btn} onClick={() => setShowForm(v => !v)}>
                  {showForm ? 'Cancel' : '+ New Rule'}
                </button>
              )}
            </div>

            {showForm && (
              <form onSubmit={handleCreate} className={styles.form}>
                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>Name</label>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="High error rate" />
                  </div>
                  <div className={styles.field}>
                    <label>Metric</label>
                    <select value={form.metricName} onChange={e => setForm(f => ({ ...f, metricName: e.target.value }))}>
                      <option value="events_per_minute">Events per minute</option>
                      <option value="error_rate">Error rate (%)</option>
                      <option value="unique_users">Unique users</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Operator</label>
                    <select value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value }))}>
                      <option value="gt">{'>'} greater than</option>
                      <option value="gte">{'>='} greater or equal</option>
                      <option value="lt">{'<'} less than</option>
                      <option value="lte">{'<='} less or equal</option>
                      <option value="eq">= equal</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Threshold</label>
                    <input type="number" value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))} required placeholder="5" />
                  </div>
                  <div className={styles.field}>
                    <label>Window (secs)</label>
                    <input type="number" value={form.windowSecs} onChange={e => setForm(f => ({ ...f, windowSecs: e.target.value }))} />
                  </div>
                  <div className={styles.field}>
                    <label>Cooldown (secs)</label>
                    <input type="number" value={form.cooldownSecs} onChange={e => setForm(f => ({ ...f, cooldownSecs: e.target.value }))} />
                  </div>
                </div>
                <button type="submit" className={styles.btn} disabled={loading}>
                  {loading ? 'Creating…' : 'Create Rule'}
                </button>
              </form>
            )}

            <div className={styles.rulesGrid}>
              {rules.length === 0 && <p className={styles.empty}>No alert rules yet.</p>}
              {rules.map(rule => (
                <div key={rule.id} className={`${styles.ruleCard} ${!rule.is_active ? styles.inactive : ''}`}>
                  <div className={styles.ruleHeader}>
                    <span className={styles.ruleName}>{rule.name}</span>
                    <div className={styles.ruleActions}>
                      {canEdit && (
                        <button className={styles.toggleBtn} onClick={() => handleToggle(rule)}>
                          {rule.is_active ? 'Disable' : 'Enable'}
                        </button>
                      )}
                      {user?.role === 'admin' && (
                        <button className={styles.deleteBtn} onClick={() => handleDelete(rule.id)}>Delete</button>
                      )}
                    </div>
                  </div>
                  <p className={styles.ruleDetail}>
                    {rule.metric_name} {rule.operator} {rule.threshold} over {rule.window_secs}s
                  </p>
                  <p className={styles.ruleMeta}>
                    Cooldown: {rule.cooldown_secs}s · {rule.is_active ? '🟢 Active' : '⚪ Inactive'}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Alert event history */}
          <section>
            <h2 className={styles.sectionTitle}>Alert History</h2>
            <div className={styles.list}>
              {events.length === 0 && <p className={styles.empty}>No alerts fired yet.</p>}
              {events.map(e => (
                <AlertBadge key={e.id} alert={{
                  ruleName: e.rule_name,
                  metricName: e.metric_name,
                  operator: e.operator,
                  threshold: e.threshold,
                  value: parseFloat(e.value_at_trigger),
                  triggeredAt: e.triggered_at,
                }} />
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
