// client/src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authAPI } from '../api/endpoints'
import { connectSocket, disconnectSocket } from '../socket/socketClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  // Restore session on mount
  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (!token) { setLoading(false); return }

    authAPI.me()
      .then(({ data }) => {
        setUser(data.data?.user || data.data)
        connectSocket(token)
      })
      .catch(() => localStorage.clear())
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email, password) => {
    const { data } = await authAPI.login({ email, password })
    const { token, user } = data.data
    localStorage.setItem('accessToken', token)
    setUser(user)
    connectSocket(token)
    return user
  }, [])

  const logout = useCallback(async () => {
    try { await authAPI.logout() } catch {}
    localStorage.clear()
    disconnectSocket()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
