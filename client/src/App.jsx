// client/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { MetricsProvider } from './context/MetricsContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Alerts from './pages/Alerts'
import PrivateRoute from './components/layout/PrivateRoute'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MetricsProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/alerts" element={<PrivateRoute><Alerts /></PrivateRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MetricsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
