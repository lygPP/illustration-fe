import { FormEvent, useState } from 'react'
import { useAuth } from '../auth'

type AuthMode = 'login' | 'register'

export default function AuthPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<AuthMode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!username.trim() || !password) return

    setSubmitting(true)
    setError('')
    try {
      if (mode === 'login') {
        await login(username.trim(), password)
      } else {
        await register(username.trim(), password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand">
          <h1>AI创作工坊</h1>
          <p>登录后继续使用基础工具、插画助手和个人创作记录。</p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="登录或注册">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => {
              setMode('login')
              setError('')
            }}
          >
            登录
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => {
              setMode('register')
              setError('')
            }}
          >
            注册
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            用户名
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="请输入用户名"
            />
          </label>
          <label>
            密码
            <input
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="btn auth-submit" disabled={submitting || !username.trim() || !password}>
            {submitting ? '处理中...' : mode === 'login' ? '登录' : '注册并登录'}
          </button>
        </form>
      </section>
    </div>
  )
}
