export const AUTH_TOKEN_KEY = 'illustration_auth_token'

export function getAuthToken() {
  return window.localStorage.getItem(AUTH_TOKEN_KEY)
}

export function setAuthToken(token: string | null) {
  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token)
    return
  }
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const token = getAuthToken()

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(input, {
    ...init,
    headers
  })
}

export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      data?.detail ||
      `${response.status} ${response.statusText}`
    throw new Error(message)
  }

  return data as T
}
