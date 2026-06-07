import { FormEvent, useEffect, useMemo, useState } from 'react'
import { AuthUser, useAuth } from '../auth'
import { apiFetch, parseJsonResponse } from '../api'

type UnknownRecord = Record<string, unknown>

interface UsageRow {
  model: string
  tokens: number
  requests: number
  images: number
  videos: number
}

function getString(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number') return String(value)
  }
  return ''
}

function getNumber(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number') return value
    if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) return Number(value)
  }
  return 0
}

function getListPayload(data: unknown, keys: string[]) {
  if (Array.isArray(data)) return data as UnknownRecord[]
  if (!data || typeof data !== 'object') return []
  const record = data as UnknownRecord
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) return value as UnknownRecord[]
  }
  return []
}

function normalizeUsage(data: unknown): UsageRow[] {
  const directList = getListPayload(data, ['usage', 'items', 'records', 'data'])
  if (directList.length > 0) {
    return directList.map((item) => ({
      model: getString(item, ['model', 'modelName', 'model_name', 'name']) || 'unknown',
      tokens: getNumber(item, ['tokens', 'token', 'totalTokens', 'total_tokens', 'tokenUsage']),
      requests: getNumber(item, ['requests', 'requestCount', 'request_count', 'count', 'total', 'generations']),
      images: getNumber(item, ['images', 'imageCount', 'image_count']),
      videos: getNumber(item, ['videos', 'videoCount', 'video_count'])
    }))
  }

  if (!data || typeof data !== 'object') return []

  return Object.entries(data as UnknownRecord)
    .filter(([, value]) => value && typeof value === 'object')
    .map(([model, value]) => {
      const item = value as UnknownRecord
      return {
        model,
        tokens: getNumber(item, ['tokens', 'token', 'totalTokens', 'total_tokens', 'tokenUsage']),
        requests: getNumber(item, ['requests', 'requestCount', 'request_count', 'count', 'total', 'generations']),
        images: getNumber(item, ['images', 'imageCount', 'image_count']),
        videos: getNumber(item, ['videos', 'videoCount', 'video_count'])
      }
    })
}

function formatDate(value: string) {
  if (!value) return '未知时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function displayUserName(user: AuthUser | null) {
  return user?.nickname || user?.username || user?.name || user?.email || '当前用户'
}

function avatarUrl(user: AuthUser | null) {
  return String(user?.avatar_url || user?.avatarUrl || '')
}

function findPreview(record: UnknownRecord, kind: 'image' | 'video') {
  const directKeys =
    kind === 'image'
      ? ['imageUrl', 'image_url', 'previewUrl', 'preview_url', 'resultUrl', 'result_url', 'url']
      : ['videoUrl', 'video_url', 'previewUrl', 'preview_url', 'resultUrl', 'result_url', 'url']
  const direct = getString(record, directKeys)
  if (direct) return direct

  const arrayKeys = kind === 'image' ? ['images', 'imageUrls', 'image_urls'] : ['videos', 'videoUrls', 'video_urls']
  for (const key of arrayKeys) {
    const value = record[key]
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  }
  return ''
}

export default function ProfilePage() {
  const { user, refreshMe, updateProfile, uploadAvatar } = useAuth()
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(user)
  const [nickname, setNickname] = useState('')
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null)
  const [selectedAvatarPreview, setSelectedAvatarPreview] = useState('')
  const [editingField, setEditingField] = useState<'nickname' | 'avatar' | null>(null)
  const [history, setHistory] = useState<UnknownRecord[]>([])
  const [usage, setUsage] = useState<UsageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profileError, setProfileError] = useState('')
  const [profileMessage, setProfileMessage] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      setLoading(true)
      setError('')
      try {
        const [meResult, historyResult, usageResult] = await Promise.all([
          refreshMe(),
          apiFetch('/api/me/history').then((response) => parseJsonResponse<unknown>(response)),
          apiFetch('/api/me/usage').then((response) => parseJsonResponse<unknown>(response))
        ])

        if (cancelled) return
        setCurrentUser(meResult)
        setNickname(displayUserName(meResult))
        setHistory(getListPayload(historyResult, ['history', 'items', 'records', 'data']))
        setUsage(normalizeUsage(usageResult))
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '个人主页加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [refreshMe])

  const totals = useMemo(
    () =>
      usage.reduce(
        (acc, item) => ({
          tokens: acc.tokens + item.tokens,
          requests: acc.requests + item.requests,
          images: acc.images + item.images,
          videos: acc.videos + item.videos
        }),
        { tokens: 0, requests: 0, images: 0, videos: 0 }
      ),
    [usage]
  )

  const handleSaveProfile = async (event?: FormEvent) => {
    event?.preventDefault()
    setProfileSaving(true)
    setProfileMessage('')
    setProfileError('')
    try {
      let nextUser: AuthUser | null
      if (editingField === 'avatar') {
        if (!selectedAvatarFile) {
          setProfileError('请选择本地头像文件')
          return
        }
        nextUser = await uploadAvatar(selectedAvatarFile)
      } else {
        nextUser = await updateProfile({ nickname: nickname.trim(), avatarUrl: avatarUrl(currentUser) })
      }
      setCurrentUser(nextUser)
      setNickname(displayUserName(nextUser))
      setProfileMessage('资料已保存')
      setEditingField(null)
      setSelectedAvatarFile(null)
      setSelectedAvatarPreview('')
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : '资料保存失败')
    } finally {
      setProfileSaving(false)
    }
  }

  const cancelEdit = () => {
    setNickname(displayUserName(currentUser))
    setSelectedAvatarFile(null)
    setSelectedAvatarPreview('')
    setProfileError('')
    setProfileMessage('')
    setEditingField(null)
  }

  const openAvatarEdit = () => {
    setSelectedAvatarFile(null)
    setSelectedAvatarPreview(avatarUrl(currentUser))
    setProfileError('')
    setProfileMessage('')
    setEditingField('avatar')
  }

  const handleAvatarPick = (file: File | undefined) => {
    if (!file) return
    setSelectedAvatarFile(file)
    setSelectedAvatarPreview(URL.createObjectURL(file))
  }

  return (
    <div className="profile-page">
      <section className="profile-header">
        <div className="profile-identity">
          <button className="profile-avatar editable" onClick={openAvatarEdit} type="button" aria-label="修改头像">
            {avatarUrl(currentUser) ? <img src={avatarUrl(currentUser)} alt="" /> : displayUserName(currentUser).slice(0, 1).toUpperCase()}
          </button>
          <div>
            <div className="profile-kicker">个人主页</div>
            <button className="profile-name-edit" onClick={() => setEditingField('nickname')} type="button" aria-label="修改昵称">
              {displayUserName(currentUser)}
            </button>
            <p>{currentUser?.username ? `账号：${currentUser.username}` : '查看账号信息、历史生成记录与模型用量统计。'}</p>
            {profileMessage && <span className="profile-message inline">{profileMessage}</span>}
          </div>
        </div>
        <div className="profile-stats">
          <div>
            <span>{history.length}</span>
            <small>历史记录</small>
          </div>
          <div>
            <span>{totals.tokens.toLocaleString()}</span>
            <small>Token</small>
          </div>
          <div>
            <span>{totals.requests.toLocaleString()}</span>
            <small>调用次数</small>
          </div>
        </div>
      </section>

      {loading && <div className="panel-empty">正在加载个人数据...</div>}
      {error && <div className="form-error">{error}</div>}

      {!loading && !error && (
        <>
          <section className="usage-panel">
            <div className="section-title">模型用量</div>
            {usage.length === 0 ? (
              <div className="panel-empty">暂无用量统计</div>
            ) : (
              <div className="usage-table">
                <div className="usage-row usage-head">
                  <span>模型</span>
                  <span>Token</span>
                  <span>调用</span>
                  <span>图片</span>
                  <span>视频</span>
                </div>
                {usage.map((item) => (
                  <div className="usage-row" key={item.model}>
                    <span>{item.model}</span>
                    <span>{item.tokens.toLocaleString()}</span>
                    <span>{item.requests.toLocaleString()}</span>
                    <span>{item.images.toLocaleString()}</span>
                    <span>{item.videos.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="history-panel">
            <div className="section-title">历史生成记录</div>
            {history.length === 0 ? (
              <div className="panel-empty">暂无历史记录</div>
            ) : (
              <div className="history-list">
                {history.map((item, index) => {
                  const type = getString(item, ['type', 'resourceType', 'resource_type', 'generateResourceType', 'kind']) || '记录'
                  const model = getString(item, ['model', 'modelName', 'model_name']) || 'unknown'
                  const status = getString(item, ['status', 'state']) || 'completed'
                  const title =
                    getString(item, ['prompt', 'theme', 'title', 'content', 'description']) || `生成记录 ${index + 1}`
                  const createdAt = getString(item, ['createdAt', 'created_at', 'timestamp', 'time'])
                  const imageUrl = findPreview(item, 'image')
                  const videoUrl = findPreview(item, 'video')

                  return (
                    <article className="history-item" key={getString(item, ['id', 'taskId', 'task_id']) || index}>
                      <div className="history-preview">
                        {videoUrl ? (
                          <video src={videoUrl} controls />
                        ) : imageUrl ? (
                          <img src={imageUrl} alt="历史生成预览" />
                        ) : (
                          <span>无预览</span>
                        )}
                      </div>
                      <div className="history-body">
                        <div className="history-meta">
                          <span>{type}</span>
                          <span>{model}</span>
                          <span>{status}</span>
                          <span>{formatDate(createdAt)}</span>
                        </div>
                        <p>{title}</p>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
      {editingField && (
        <div className="profile-edit-popover" role="dialog" aria-modal="true" onClick={cancelEdit}>
          <form className="inline-edit-card" onSubmit={handleSaveProfile} onClick={(event) => event.stopPropagation()}>
            <div className="section-title">{editingField === 'nickname' ? '修改昵称' : '修改头像'}</div>
            {editingField === 'nickname' ? (
              <label>
                昵称
                <input autoFocus value={nickname} maxLength={40} onChange={(event) => setNickname(event.target.value)} placeholder="设置展示昵称" />
              </label>
            ) : (
              <>
                <div className="avatar-preview large">
                  {selectedAvatarPreview ? <img src={selectedAvatarPreview} alt="头像预览" /> : <span>{displayUserName(currentUser).slice(0, 1).toUpperCase()}</span>}
                </div>
                <label>
                  本地头像文件
                  <input autoFocus type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => handleAvatarPick(event.target.files?.[0])} />
                </label>
              </>
            )}
            {profileError && <div className="form-error">{profileError}</div>}
            <div className="inline-edit-actions">
              <button className="btn" disabled={profileSaving} type="submit">
                {profileSaving ? '保存中...' : '保存'}
              </button>
              <button className="ghost-btn" type="button" onClick={cancelEdit}>
                取消
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
