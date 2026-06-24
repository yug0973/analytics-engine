// client/src/hooks/useSocket.js
import { useEffect, useState } from 'react'
import { getSocket } from '../socket/socketClient'

export function useSocket(event, handler) {
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    socket.on(event, handler)
    return () => socket.off(event, handler)
  }, [event, handler])
}

export function useSocketStatus() {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    setConnected(socket.connected)
    socket.on('connect',    () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    return () => {
      socket.off('connect')
      socket.off('disconnect')
    }
  }, [])

  return connected
}