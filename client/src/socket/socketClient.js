// client/src/socket/socketClient.js
import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001'

let socket = null

export function connectSocket(token) {
  if (socket?.connected) return socket

  socket = io(SOCKET_URL, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
    transports: ['websocket', 'polling'],
  })

  socket.on('connect', () => {
    console.log('[socket] Connected:', socket.id)
  })

  socket.on('disconnect', (reason) => {
    console.log('[socket] Disconnected:', reason)
  })

  socket.on('connect_error', (err) => {
    console.warn('[socket] Connection error:', err.message)
  })

  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export function getSocket() {
  return socket
}