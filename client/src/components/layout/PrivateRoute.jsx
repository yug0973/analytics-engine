// client/src/components/layout/PrivateRoute.jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>
  if (!user)   return <Navigate to="/login" replace />
  return children
}