import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiFetch, getAuthToken, parseJsonResponse, setAuthToken } from './api'

export interface AuthUser {
  id?: string | number
  username?: string
  nickname?: string
  avatar_url?: string
  avatarUrl?: string
  role?: 'user' | 'super_admin' | string
  status?: 'active' | 'disabled' | 'deleted' | string
  name?: string
  email?: string
  [key: string]: unknown
}

interface AuthResponse {
  token?: string
  user?: AuthUser
  [key: string]: unknown
}

interface AuthContextValue {
  authLoading: boolean
  token: string | null
  user: AuthUser | null
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  updateProfile: (profile: { nickname: string; avatarUrl: string }) => Promise<AuthUser | null>
  uploadAvatar: (file: File) => Promise<AuthUser | null>
  logout: () => void
  refreshMe: () => Promise<AuthUser | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function normalizeUser(data: unknown): AuthUser | null {
  if (!data || typeof data !== 'object') return null
  const maybeUser = data as { user?: AuthUser }
  if (maybeUser.user && typeof maybeUser.user === 'object') return maybeUser.user
  return data as AuthUser
}

async function authRequest(path: string, username: string, password: string) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  })

  return parseJsonResponse<AuthResponse>(response)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getAuthToken())
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  const logout = useCallback(() => {
    setAuthToken(null)
    setToken(null)
    setUser(null)
    setAuthLoading(false)
  }, [])

  const refreshMe = useCallback(async () => {
    const response = await apiFetch('/api/me')
    const data = await parseJsonResponse<unknown>(response)
    const nextUser = normalizeUser(data)
    setUser(nextUser)
    return nextUser
  }, [])

  const completeSession = useCallback(
    async (nextToken: string, nextUser?: AuthUser | null) => {
      setAuthToken(nextToken)
      setToken(nextToken)
      if (nextUser) {
        setUser(nextUser)
      } else {
        await refreshMe()
      }
    },
    [refreshMe]
  )

  const login = useCallback(
    async (username: string, password: string) => {
      const data = await authRequest('/api/auth/login', username, password)
      if (!data.token) throw new Error('登录响应缺少 token')
      await completeSession(data.token, normalizeUser(data.user))
    },
    [completeSession]
  )

  const register = useCallback(
    async (username: string, password: string) => {
      const data = await authRequest('/api/auth/register', username, password)
      if (data.token) {
        await completeSession(data.token, normalizeUser(data.user))
        return
      }
      await login(username, password)
    },
    [completeSession, login]
  )

  const updateProfile = useCallback(async (profile: { nickname: string; avatarUrl: string }) => {
    const response = await apiFetch('/api/me', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nickname: profile.nickname,
        avatar_url: profile.avatarUrl
      })
    })
    const data = await parseJsonResponse<unknown>(response)
    const nextUser = normalizeUser(data)
    setUser(nextUser)
    return nextUser
  }, [])

  const uploadAvatar = useCallback(async (file: File) => {
    const formData = new FormData()
    formData.append('avatar', file)
    const response = await apiFetch('/api/me/avatar', {
      method: 'POST',
      body: formData
    })
    const data = await parseJsonResponse<unknown>(response)
    const nextUser = normalizeUser(data)
    setUser(nextUser)
    return nextUser
  }, [])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      if (!token) {
        setAuthLoading(false)
        return
      }

      setAuthLoading(true)
      try {
        const currentUser = await refreshMe()
        if (!cancelled && !currentUser) logout()
      } catch (error) {
        if (!cancelled) logout()
      } finally {
        if (!cancelled) setAuthLoading(false)
      }
    }

    bootstrap()

    return () => {
      cancelled = true
    }
  }, [logout, refreshMe, token])

  const value = useMemo<AuthContextValue>(
    () => ({
      authLoading,
      token,
      user,
      login,
      register,
      updateProfile,
      uploadAvatar,
      logout,
      refreshMe
    }),
    [authLoading, token, user, login, register, updateProfile, uploadAvatar, logout, refreshMe]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
