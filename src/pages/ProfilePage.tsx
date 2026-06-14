import { FormEvent, useEffect, useMemo, useState } from 'react'
import { AuthUser, useAuth } from '../auth'
import { apiFetch, parseJsonResponse } from '../api'
import type { IllustrationRecoverRequest } from '../App'

type UnknownRecord = Record<string, unknown>

interface UsageRow {
  model: string
  tokens: number
  requests: number
  updatedAt: string
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

function getRecord(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as UnknownRecord
  }
  return null
}

function getArray(record: UnknownRecord | null, keys: string[]) {
  if (!record) return []
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) return value as UnknownRecord[]
  }
  return []
}

function mapValues(record: UnknownRecord | null, keys: string[]) {
  if (!record) return [] as Array<{ index: number; value: unknown }>
  const source = getRecord(record, keys)
  if (!source) return []
  return Object.entries(source)
    .map(([key, value]) => ({ index: Number(key), value }))
    .filter((item) => !Number.isNaN(item.index))
    .sort((a, b) => a.index - b.index)
}

function stringList(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
  if (typeof value === 'string' && value.trim()) return [value]
  return []
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
      updatedAt: getString(item, ['updatedAt', 'updated_at', 'time', 'timestamp'])
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
        updatedAt: getString(item, ['updatedAt', 'updated_at', 'time', 'timestamp'])
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

function isAgentWork(record: UnknownRecord) {
  return getString(record, ['item_type', 'itemType']) === 'agent_work' || getString(record, ['kind']) === 'agent_work'
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    processing: '生成中',
    waiting_feedback: '等待反馈',
    succeeded: '已完成',
    failed: '失败'
  }
  return labels[status] || status || '未知'
}

interface ProfilePageProps {
  onRecoverAgentWork?: (request: Omit<IllustrationRecoverRequest, 'nonce'>) => void
}

export default function ProfilePage({ onRecoverAgentWork }: ProfilePageProps) {
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
  const [selectedWork, setSelectedWork] = useState<UnknownRecord | null>(null)
  const [workLoading, setWorkLoading] = useState(false)
  const [workError, setWorkError] = useState('')
  const [recoverInput, setRecoverInput] = useState('')
  const [recoverError, setRecoverError] = useState('')

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
          requests: acc.requests + item.requests
        }),
        { tokens: 0, requests: 0 }
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

  const openAgentWork = async (item: UnknownRecord) => {
    const sessionId = getString(item, ['session_id', 'sessionId', 'task_id', 'taskId', 'id'])
    if (!sessionId) return
    setWorkLoading(true)
    setWorkError('')
    try {
      const data = await apiFetch(`/api/me/agent-works/${encodeURIComponent(sessionId)}`).then((response) =>
        parseJsonResponse<unknown>(response)
      )
      const work = getRecord(data as UnknownRecord, ['work']) || (data as UnknownRecord)
      setSelectedWork(work)
      setRecoverInput('')
      setRecoverError('')
    } catch (err) {
      setWorkError(err instanceof Error ? err.message : '作品详情加载失败')
    } finally {
      setWorkLoading(false)
    }
  }

  const handleRecoverSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedWork) return
    const sessionId = getString(selectedWork, ['session_id', 'sessionId', 'id'])
    const input = recoverInput.trim()
    if (!sessionId || !input) return
    setRecoverError('')
    if (!onRecoverAgentWork) {
      setRecoverError('当前页面暂不支持跳转恢复执行')
      return
    }
    onRecoverAgentWork({
      sessionId,
      input,
      theme: getString(selectedWork, ['theme', 'prompt']) || '历史插画任务'
    })
  }

  const renderMediaList = (urls: string[], type: 'image' | 'video' | 'audio') => {
    if (urls.length === 0) return <span className="work-empty-inline">暂无</span>
    return (
      <div className={`work-media-list ${type}`}>
        {urls.map((url, index) => {
          if (type === 'audio') return <audio key={`${url}-${index}`} src={url} controls />
          if (type === 'video') return <video key={`${url}-${index}`} src={url} controls />
          return <img key={`${url}-${index}`} src={url} alt={`作品素材 ${index + 1}`} />
        })}
      </div>
    )
  }

  const renderAgentWorkDetail = () => {
    if (!selectedWork) return null
    const story = getRecord(selectedWork, ['story'])
    const chapters = getArray(story, ['chapters'])
    const characters = getArray(selectedWork, ['characters'])
    const imagePrompts = getArray(selectedWork, ['image_prompts', 'imagePrompts'])
    const videoPrompts = getArray(selectedWork, ['chapter_video_prompts', 'chapterVideoPrompts'])
    const generatedImages = mapValues(selectedWork, ['generated_images', 'generatedImages'])
    const confirmedImages = mapValues(selectedWork, ['confirmed_images', 'confirmedImages'])
    const chapterAudios = mapValues(selectedWork, ['chapter_audio_urls', 'chapterAudioUrls'])
    const chapterVideos = mapValues(selectedWork, ['chapter_video_urls', 'chapterVideoUrls'])
    const narratedVideos = mapValues(selectedWork, ['narrated_chapter_video_urls', 'narratedChapterVideoUrls'])
    const finalVideo = getString(selectedWork, ['video_url', 'videoUrl'])
    const chapterCount = Math.max(chapters.length, confirmedImages.length, chapterAudios.length, chapterVideos.length, narratedVideos.length)

    return (
      <div className="work-detail-backdrop" onClick={() => setSelectedWork(null)}>
        <section className="work-detail" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
          <div className="work-detail-head">
            <div>
              <div className="profile-kicker">插画作品详情</div>
              <h2>{getString(selectedWork, ['theme', 'prompt']) || '未命名作品'}</h2>
              <div className="history-meta">
                <span>{statusLabel(getString(selectedWork, ['status']))}</span>
                <span>{formatDate(getString(selectedWork, ['updated_at', 'updatedAt', 'created_at', 'createdAt']))}</span>
              </div>
            </div>
            <button className="ghost-btn" type="button" onClick={() => setSelectedWork(null)}>
              关闭
            </button>
          </div>

	          {getString(selectedWork, ['error_message', 'errorMessage']) && (
	            <div className="form-error">{getString(selectedWork, ['error_message', 'errorMessage'])}</div>
	          )}

	          <section className="work-section recover-section">
	            <div className="section-title">恢复执行</div>
	            <form className="recover-form" onSubmit={handleRecoverSubmit}>
	              <textarea
	                value={recoverInput}
	                onChange={(event) => setRecoverInput(event.target.value)}
	                placeholder="例如：从当前最新位置继续 / 回到第2章首帧图重新生成 / 从角色开始重跑"
	              />
	              <div className="inline-edit-actions">
	                <button className="btn" type="submit" disabled={!recoverInput.trim()}>
	                  跳转到插画助手恢复
	                </button>
	                <span className="recover-hint">提交后会打开插画助手，并自动填入这条恢复指令开始执行。</span>
	              </div>
	            </form>
	            {recoverError && <div className="form-error">{recoverError}</div>}
	          </section>

	          {finalVideo && (
            <section className="work-section">
              <div className="section-title">完整视频</div>
              {renderMediaList([finalVideo], 'video')}
            </section>
          )}

          <section className="work-section">
            <div className="section-title">故事章节</div>
            {chapters.length === 0 ? (
              <div className="panel-empty">暂无故事内容</div>
            ) : (
              <div className="work-chapters">
                {chapters.map((chapter, index) => (
                  <article className="work-chapter" key={index}>
                    <strong>{getString(chapter, ['title']) || `第 ${index + 1} 章`}</strong>
                    <p>{getString(chapter, ['content'])}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="work-section">
            <div className="section-title">全局角色</div>
            {characters.length === 0 ? (
              <div className="panel-empty">暂无角色信息</div>
            ) : (
              <div className="work-character-grid">
                {characters.map((character, index) => (
                  <article className="work-character" key={getString(character, ['id']) || index}>
                    {renderMediaList(stringList(character.reference_image_urls || character.referenceImageUrls), 'image')}
                    <strong>{getString(character, ['name']) || `角色 ${index + 1}`}</strong>
                    <span>{getString(character, ['role'])}</span>
                    <p>{getString(character, ['description'])}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="work-section">
            <div className="section-title">章节素材</div>
            {chapterCount === 0 ? (
              <div className="panel-empty">暂无章节素材</div>
            ) : (
              <div className="work-chapters">
                {Array.from({ length: chapterCount }).map((_, index) => {
                  const imagePrompt = imagePrompts.find((item) => getNumber(item, ['chapter_index', 'chapterIndex']) === index)
                  const videoPrompt = videoPrompts.find((item) => getNumber(item, ['chapter_index', 'chapterIndex']) === index)
                  return (
                    <article className="work-chapter media" key={index}>
                      <strong>第 {index + 1} 章</strong>
                      {imagePrompt && <p>图片提示词：{getString(imagePrompt, ['prompt'])}</p>}
                      {videoPrompt && <p>视频提示词：{getString(videoPrompt, ['prompt'])}</p>}
                      <div className="work-media-row">
                        <div>
                          <small>生成图片</small>
                          {renderMediaList(stringList(generatedImages.find((item) => item.index === index)?.value), 'image')}
                        </div>
                        <div>
                          <small>确认首帧</small>
                          {renderMediaList(stringList(confirmedImages.find((item) => item.index === index)?.value), 'image')}
                        </div>
                        <div>
                          <small>语音</small>
                          {renderMediaList(stringList(chapterAudios.find((item) => item.index === index)?.value), 'audio')}
                        </div>
                        <div>
                          <small>章节视频</small>
                          {renderMediaList(stringList(chapterVideos.find((item) => item.index === index)?.value), 'video')}
                        </div>
                        <div>
                          <small>带解说视频</small>
                          {renderMediaList(stringList(narratedVideos.find((item) => item.index === index)?.value), 'video')}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </section>
      </div>
    )
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
                  <span>更新时间</span>
                </div>
                {usage.map((item) => (
                  <div className="usage-row" key={item.model}>
                    <span>{item.model}</span>
                    <span>{item.tokens.toLocaleString()}</span>
                    <span>{item.requests.toLocaleString()}</span>
                    <span>{formatDate(item.updatedAt)}</span>
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
                  const agentWork = isAgentWork(item)
                  const type = getString(item, ['type', 'resourceType', 'resource_type', 'generateResourceType', 'kind']) || '记录'
                  const model = getString(item, ['model', 'modelName', 'model_name']) || 'unknown'
                  const status = getString(item, ['status', 'state']) || 'completed'
                  const title =
                    getString(item, ['prompt', 'theme', 'title', 'content', 'description']) || `生成记录 ${index + 1}`
                  const createdAt = getString(item, ['createdAt', 'created_at', 'timestamp', 'time'])
                  const imageUrl = findPreview(item, 'image')
                  const videoUrl = findPreview(item, 'video')

                  return (
                    <article
                      className={`history-item ${agentWork ? 'clickable' : ''}`}
                      key={getString(item, ['id', 'taskId', 'task_id']) || index}
                      onClick={agentWork ? () => openAgentWork(item) : undefined}
                    >
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
                          <span>{statusLabel(status)}</span>
                          <span>{formatDate(createdAt)}</span>
                          {agentWork && <span>可查看详情</span>}
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
      {workError && <div className="form-error">{workError}</div>}
      {workLoading && <div className="panel-empty">正在加载作品详情...</div>}
      {renderAgentWorkDetail()}
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
