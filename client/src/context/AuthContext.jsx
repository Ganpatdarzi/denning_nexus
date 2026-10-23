import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, tokenStore } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => tokenStore.get())
  const [booting, setBooting] = useState(Boolean(tokenStore.get()))

  useEffect(() => {
    if (!token) {
      setBooting(false)
      setUser(null)
      return
    }
    let cancelled = false
    api
      .get('/auth/me')
      .then((data) => {
        if (!cancelled) setUser(data.user)
      })
      .catch(() => {
        if (!cancelled) {
          tokenStore.clear()
          setToken(null)
          setUser(null)
        }
      })
      .finally(() => {
        if (!cancelled) setBooting(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const login = useCallback(async (email, password) => {
    const data = await api.post('/auth/login', { email, password })
    tokenStore.set(data.token)
    setToken(data.token)
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (payload) => {
    const data = await api.post('/auth/register', payload)
    if (data.token) {
      tokenStore.set(data.token)
      setToken(data.token)
      setUser(data.user)
    }
    return data
  }, [])

  const logout = useCallback(() => {
    tokenStore.clear()
    setToken(null)
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    const data = await api.get('/auth/me')
    setUser(data.user)
    return data.user
  }, [])

  const value = useMemo(
    () => ({
      user,
      token,
      booting,
      isAuthed: Boolean(user),
      login,
      register,
      logout,
      refreshUser,
      setUser,
    }),
    [user, token, booting, login, register, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
