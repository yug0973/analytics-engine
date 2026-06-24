// client/src/api/endpoints.js
import api from './axios'

// ── Auth ─────────────────────────────────────────────────
export const authAPI = {
  register: (data)  => api.post('/auth/register', data),
  login:    (data)  => api.post('/auth/login', data),
  logout:   ()      => api.post('/auth/logout'),
  me:       ()      => api.get('/auth/me'),
}

// ── Events ───────────────────────────────────────────────
export const eventsAPI = {
  ingest: (data) => api.post('/events', data),
  batch:  (data) => api.post('/events/batch', data),
}

// ── Analytics ────────────────────────────────────────────
export const analyticsAPI = {
  timeSeries: (params) => api.get('/analytics/time-series', { params }),
  summary:    (params) => api.get('/analytics/summary',    { params }),
  events:     (params) => api.get('/analytics/events',     { params }),
  live:       (params) => api.get('/analytics/live',       { params }),
}

// ── Alerts ───────────────────────────────────────────────
export const alertsAPI = {
  listRules:   ()           => api.get('/alerts/rules'),
  createRule:  (data)       => api.post('/alerts/rules', data),
  updateRule:  (id, data)   => api.patch(`/alerts/rules/${id}`, data),
  deleteRule:  (id)         => api.delete(`/alerts/rules/${id}`),
  listEvents:  (params)     => api.get('/alerts/events', { params }),
}
