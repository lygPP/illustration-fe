import { FormEvent, useEffect, useMemo, useState } from 'react'
import { apiFetch, parseJsonResponse } from '../api'

interface ManagedUser {
  id: string
  username: string
  nickname?: string
  avatar_url?: string
  role?: string
  status?: string
  created_at?: string
  updated_at?: string
}

interface UserDetail {
  user?: ManagedUser
  history?: unknown[]
  usage?: unknown[]
  personas?: unknown[]
  voices?: unknown[]
}

function usersPayload(data: unknown) {
  if (!data || typeof data !== 'object') return []
  const value = (data as Record<string, unknown>).users
  return Array.isArray(value) ? (value as ManagedUser[]) : []
}

function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function recordLabel(item: unknown, fallback: string) {
  if (!item || typeof item !== 'object') return fallback
  const record = item as Record<string, unknown>
  for (const key of ['name', 'nickname', 'username', 'model_name', 'modelName', 'prompt', 'summary', 'status']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number') return String(value)
  }
  return fallback
}

function detailList(title: string, items: unknown[] | undefined) {
  const list = Array.isArray(items) ? items : []
  return (
    <div className="admin-mini-list">
      <strong>{title}</strong>
      {list.length === 0 ? (
        <span>暂无数据</span>
      ) : (
        list.slice(0, 5).map((item, index) => <span key={`${title}-${index}`}>{recordLabel(item, `记录 ${index + 1}`)}</span>)
      )}
    </div>
  )
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [keyword, setKeyword] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [createForm, setCreateForm] = useState({ username: '', password: '', nickname: '', avatar_url: '', role: 'user', status: 'active' })
  const [editForm, setEditForm] = useState({ nickname: '', avatar_url: '', role: 'user', status: 'active' })
  const [resetPassword, setResetPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const selectedUser = useMemo(() => users.find((user) => user.id === selectedId) || null, [selectedId, users])

  const loadUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const query = keyword.trim() ? `?keyword=${encodeURIComponent(keyword.trim())}` : ''
      const data = await apiFetch(`/api/admin/users${query}`).then((res) => parseJsonResponse<unknown>(res))
      const nextUsers = usersPayload(data)
      setUsers(nextUsers)
      if (!selectedId && nextUsers[0]) setSelectedId(nextUsers[0].id)
      if (selectedId && !nextUsers.some((user) => user.id === selectedId)) setSelectedId(nextUsers[0]?.id || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : '用户列表加载失败')
    } finally {
      setLoading(false)
    }
  }

  const loadDetail = async (userId: string) => {
    if (!userId) {
      setDetail(null)
      return
    }
    try {
      const data = await apiFetch(`/api/admin/users/${userId}`).then((res) => parseJsonResponse<UserDetail>(res))
      setDetail(data)
      const user = data.user
      if (user) {
        setEditForm({
          nickname: user.nickname || '',
          avatar_url: user.avatar_url || '',
          role: user.role || 'user',
          status: user.status || 'active'
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '用户详情加载失败')
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  useEffect(() => {
    loadDetail(selectedId)
  }, [selectedId])

  const createUser = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm)
      })
      await parseJsonResponse<unknown>(response)
      setMessage('用户已创建')
      setCreateForm({ username: '', password: '', nickname: '', avatar_url: '', role: 'user', status: 'active' })
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建用户失败')
    } finally {
      setSaving(false)
    }
  }

  const updateUser = async () => {
    if (!selectedUser) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await apiFetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: editForm.nickname,
          avatar_url: editForm.avatar_url,
          role: editForm.role,
          status: editForm.status
        })
      })
      await parseJsonResponse<unknown>(response)
      setMessage('用户资料已更新')
      await loadUsers()
      await loadDetail(selectedUser.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新用户失败')
    } finally {
      setSaving(false)
    }
  }

  const resetUserPassword = async () => {
    if (!selectedUser || !resetPassword.trim()) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await apiFetch(`/api/admin/users/${selectedUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword })
      })
      await parseJsonResponse<unknown>(response)
      setMessage('密码已重置')
      setResetPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置密码失败')
    } finally {
      setSaving(false)
    }
  }

  const deleteUser = async () => {
    if (!selectedUser) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await apiFetch(`/api/admin/users/${selectedUser.id}`, { method: 'DELETE' })
      await parseJsonResponse<unknown>(response)
      setMessage('用户已软删除')
      await loadUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除用户失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-page">
      <section className="admin-panel">
        <div className="library-heading">
          <div>
            <div className="section-title">用户列表</div>
            <p>超级管理员可查看、创建、编辑、禁用和软删除平台用户。</p>
          </div>
          <form className="search-form" onSubmit={(e) => { e.preventDefault(); loadUsers() }}>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索用户名/昵称" />
            <button className="ghost-btn" type="submit">搜索</button>
          </form>
        </div>
        {error && <div className="form-error">{error}</div>}
        {message && <div className="profile-message">{message}</div>}
        {loading ? (
          <div className="panel-empty">正在加载用户...</div>
        ) : (
          <div className="admin-table">
            <div className="admin-row admin-head">
              <span>用户</span>
              <span>角色</span>
              <span>状态</span>
              <span>创建时间</span>
            </div>
            {users.map((user) => (
              <button className={`admin-row ${selectedId === user.id ? 'active' : ''}`} key={user.id} onClick={() => setSelectedId(user.id)} type="button">
                <span>{user.nickname || user.username}</span>
                <span>{user.role || 'user'}</span>
                <span>{user.status || 'active'}</span>
                <span>{formatDate(user.created_at)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="admin-panel">
        <div className="section-title">新建用户</div>
        <form className="library-form" onSubmit={createUser}>
          <input value={createForm.username} onChange={(e) => setCreateForm((prev) => ({ ...prev, username: e.target.value }))} placeholder="用户名" />
          <input value={createForm.password} onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="初始密码" type="password" />
          <input value={createForm.nickname} onChange={(e) => setCreateForm((prev) => ({ ...prev, nickname: e.target.value }))} placeholder="昵称" />
          <select value={createForm.role} onChange={(e) => setCreateForm((prev) => ({ ...prev, role: e.target.value }))}>
            <option value="user">普通用户</option>
            <option value="super_admin">超级管理员</option>
          </select>
          <button className="btn" disabled={saving || !createForm.username.trim() || !createForm.password.trim()} type="submit">创建</button>
        </form>
      </section>

      <section className="admin-panel">
        <div className="section-title">用户详情</div>
        {!selectedUser || !detail?.user ? (
          <div className="panel-empty">请选择一个用户。</div>
        ) : (
          <div className="admin-detail">
            <div className="library-form">
              <input value={editForm.nickname} onChange={(e) => setEditForm((prev) => ({ ...prev, nickname: e.target.value }))} placeholder="昵称" />
              <input value={editForm.avatar_url} onChange={(e) => setEditForm((prev) => ({ ...prev, avatar_url: e.target.value }))} placeholder="头像 URL" />
              <select value={editForm.role} onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))}>
                <option value="user">普通用户</option>
                <option value="super_admin">超级管理员</option>
              </select>
              <select value={editForm.status} onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}>
                <option value="active">启用</option>
                <option value="disabled">禁用</option>
                <option value="deleted">已删除</option>
              </select>
              <button className="btn" disabled={saving} type="button" onClick={updateUser}>保存</button>
              <button className="ghost-btn danger" disabled={saving} type="button" onClick={deleteUser}>软删除</button>
            </div>
            <div className="library-form">
              <input value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="新密码" type="password" />
              <button className="ghost-btn" disabled={saving || !resetPassword.trim()} type="button" onClick={resetUserPassword}>重置密码</button>
            </div>
            <div className="admin-summary">
              <span>历史 {detail.history?.length || 0}</span>
              <span>用量 {detail.usage?.length || 0}</span>
              <span>形象 {detail.personas?.length || 0}</span>
              <span>音色 {detail.voices?.length || 0}</span>
            </div>
            <div className="admin-mini-grid">
              {detailList('历史记录', detail.history)}
              {detailList('模型用量', detail.usage)}
              {detailList('形象', detail.personas)}
              {detailList('音色', detail.voices)}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
