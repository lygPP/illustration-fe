import { useMemo, useRef, useState, useEffect } from 'react'

type ResourceType = 'image' | 'video'
type GenMode = 'first' | 'first_last' | 'ref'

const GEN_MODES: { value: GenMode; label: string; limit: number }[] = [
  { value: 'first', label: '首帧', limit: 1 },
  { value: 'first_last', label: '首尾帧', limit: 2 },
  { value: 'ref', label: '参考图', limit: 4 }
]

type Message =
  | {
      id: string
      role: 'user'
      content: string
      attachments: string[]
      meta: { type: ResourceType; model: string; ratio: string; genMode: string }
    }
  | {
      id: string
      role: 'assistant'
      content: string
      kind: ResourceType
      previewUrl?: string
      error?: string
      taskId?: string
      status?: 'processing' | 'succeeded' | 'failed'
    }

const IMAGE_MODELS = ['seedream', 'flux-dev', 'sdxl', 'dalle3']
const VIDEO_MODELS = ['seedance1.0', 'seedance2.0', 'pika', 'sora', 'luma']
const RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:2']

async function filesToBase64(files: FileList | null): Promise<string[]> {
  if (!files || files.length === 0) return []
  const tasks = Array.from(files).map(
    (f) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('读取文件失败'))
        reader.readAsDataURL(f)
      })
  )
  return Promise.all(tasks)
}

async function callGenerateApi(
  type: ResourceType,
  model: string,
  ratio: string,
  genMode: GenMode,
  prompt: string,
  references: string[]
): Promise<{ url?: string; taskId?: string }> {
  const sizeMap: Record<string, string> = {
    '1:1': '1024x1024',
    '16:9': '1280x720',
    '9:16': '720x1280',
    '4:3': '1024x768',
    '3:2': '1080x720'
  }

  const modeLabelMap: Record<GenMode, string> = {
    first: '首帧',
    first_last: '首尾帧',
    ref: '参考图'
  }

  const payload = {
    generateResourceType: type,
    modelName: model,
    size: sizeMap[ratio] || '1024x1024',
    generateRelyType: modeLabelMap[genMode],
    imageList: references,
    prompt: prompt
  }

  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`)
  }

  const data = await response.json()
  
  if (data.message && type === 'image') {
      throw new Error(data.message)
  }

  if (type === 'image' && data.images && data.images.length > 0) {
    return { url: data.images[0] }
  } else if (type === 'video') {
    // 兼容后端返回结构：{ type: 'video', task_id: '...', message: '...' }
    if (data.task_id) return { taskId: data.task_id }
    if (data.video_url) return { url: data.video_url }
  }
  
  throw new Error('No result returned')
}

export default function ChatGenerate() {
  const [type, setType] = useState<ResourceType>('image')
  const [model, setModel] = useState(IMAGE_MODELS[0])
  const [ratio, setRatio] = useState(RATIOS[0])
  const [genMode, setGenMode] = useState<GenMode>('first')
  const [prompt, setPrompt] = useState('')
  const [references, setReferences] = useState<string[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [previewMedia, setPreviewMedia] = useState<{ type: 'image' | 'video'; url: string } | null>(null)

  // Poll video status
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      const pendingVideos = messages.filter((m) => {
        if (m.role !== 'assistant') return false
        return m.kind === 'video' && m.status === 'processing' && !!m.taskId
      }) as any[]

      if (pendingVideos.length === 0) return

      for (const msg of pendingVideos) {
        try {
          const res = await fetch(`/api/video/${msg.taskId}`)
          if (!res.ok) continue
          const data = await res.json()
          
          if (data.status === 'succeeded' && data.video_url) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msg.id && m.role === 'assistant'
                  ? { ...m, status: 'succeeded', previewUrl: data.video_url, content: '已生成视频' }
                  : m
              )
            )
          } else if (data.status === 'failed') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msg.id && m.role === 'assistant' ? { ...m, status: 'failed', error: '视频生成失败', content: '生成失败' } : m
              )
            )
          }
        } catch (e) {
          console.error('Poll error', e)
        }
      }
    }, 30000)

    return () => clearInterval(pollInterval)
  }, [messages])

  const modelOptions = useMemo(() => (type === 'image' ? IMAGE_MODELS : VIDEO_MODELS), [type])
  const currentLimit = useMemo(() => GEN_MODES.find((m) => m.value === genMode)?.limit || 4, [genMode])

  const handlePickFiles = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const files = ev.target.files
    if (!files || files.length === 0) return

    if (references.length + files.length > currentLimit) {
      alert(`当前模式最多只能上传 ${currentLimit} 个文件`)
      ev.target.value = ''
      return
    }

    const base64s = await filesToBase64(files)
    setReferences((prev: string[]) => [...prev, ...base64s])
    // reset so picking the same files again still triggers change
    ev.target.value = ''
  }

  const handleRemoveRef = (idx: number) => {
    setReferences((prev: string[]) => prev.filter((_, i: number) => i !== idx))
  }

  const handleSend = async () => {
    if (!prompt.trim()) return
    const id = crypto.randomUUID()
    const userMsg: Message = {
      id,
      role: 'user',
      content: prompt,
      attachments: references,
      meta: { type, model, ratio, genMode }
    }
    setMessages((m: Message[]) => [...m, userMsg])
    setLoading(true)
    setPrompt('')
    setReferences([])
    try {
      const { url, taskId } = await callGenerateApi(type, model, ratio, genMode, prompt, references)
      const assistant: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: type === 'image' ? '已生成图片' : '视频生成中...',
        kind: type,
        previewUrl: url,
        taskId,
        status: taskId ? 'processing' : 'succeeded'
      }
      setMessages((m: Message[]) => [...m, assistant])
    } catch (e: any) {
      const assistant: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '生成失败',
        kind: type,
        error: e?.message ?? '未知错误'
      }
      setMessages((m: Message[]) => [...m, assistant])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="chat-wrap">
      <section className="messages" aria-live="polite">
        {messages.length === 0 && (
          <div style={{ color: '#9ca3af', textAlign: 'center', marginTop: 40 }}>
            开始你的创作吧：选择类型、模型、比例，上传参考，输入提示词发送。
          </div>
        )}
        {messages.map((msg: Message) => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="message msg-user">
                <div className="bubble">
                  <div className="meta">
                    {msg.meta.type} · {msg.meta.model} · {msg.meta.ratio}
                  </div>
                  <div className="content">{msg.content}</div>
                  {msg.attachments?.length > 0 && (
                    <div className="attachments">
                      {msg.attachments.map((a, i) =>
                        a.startsWith('data:video') ? (
                          <div 
                            key={i} 
                            style={{ position: 'relative', cursor: 'zoom-in' }}
                            onClick={() => setPreviewMedia({ type: 'video', url: a })}
                          >
                            <video src={a} style={{ pointerEvents: 'none' }} />
                            <div style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              width: 32,
                              height: 32,
                              background: 'rgba(0,0,0,0.5)',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              pointerEvents: 'none'
                            }}>
                              <span style={{ color: 'white', fontSize: 14 }}>▶</span>
                            </div>
                          </div>
                        ) : (
                          <img
                            key={i}
                            src={a}
                            alt={`ref-${i}`}
                            onClick={() => setPreviewMedia({ type: 'image', url: a })}
                          />
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          }
          return (
            <div key={msg.id} className="message">
              <div className="bubble assistant">
                <div className="meta">助手</div>
                <div className="content">
                  {msg.content}
                  {msg.error ? <span style={{color: 'red'}}>：{msg.error}</span> : ''}
                </div>
                {msg.kind === 'video' && msg.status === 'processing' && (
                  <div className="generating-loader" style={{ marginTop: 8 }}>
                    <div className="dots-container">
                      <div className="dot" />
                      <div className="dot" />
                      <div className="dot" />
                    </div>
                    <span>视频生成中...</span>
                  </div>
                )}
                {msg.status === 'succeeded' && msg.previewUrl && (
                  <div className="attachments">
                    {msg.kind === 'image' ? (
                      <img
                        src={msg.previewUrl}
                        alt="result"
                        onClick={() => setPreviewMedia({ type: 'image', url: msg.previewUrl! })}
                      />
                    ) : (
                      <div 
                        style={{ position: 'relative', cursor: 'zoom-in' }}
                        onClick={() => setPreviewMedia({ type: 'video', url: msg.previewUrl! })}
                      >
                        <video src={msg.previewUrl} style={{ pointerEvents: 'none' }} />
                        <div style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          width: 48,
                          height: 48,
                          background: 'rgba(0,0,0,0.5)',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          pointerEvents: 'none'
                        }}>
                          <span style={{ color: 'white', fontSize: 24 }}>▶</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {loading && (
          <div className="message">
            <div className="bubble assistant">
              <div className="meta">助手</div>
              <div className="content">
                <div className="generating-loader">
                  <div className="dots-container">
                    <div className="dot" />
                    <div className="dot" />
                    <div className="dot" />
                  </div>
                  <span>正在生成{type === 'image' ? '图片' : '视频'}...</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {previewMedia && (
        <div
          className="modal-overlay"
          onClick={() => setPreviewMedia(null)}
          role="dialog"
          aria-modal="true"
        >
          {previewMedia.type === 'image' ? (
            <img
              src={previewMedia.url}
              alt="preview"
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <video
              src={previewMedia.url}
              controls
              autoPlay
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}

      <section className="composer">
        <div className="prompt">
          <textarea
            placeholder="请输入提示词（例如：夜色下的未来城市，霓虹、雨夜、反射）"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                if (!loading) handleSend()
              }
            }}
          />
          <button className="btn" disabled={loading || !prompt.trim()} onClick={handleSend}>
            {loading ? '生成中…' : '发送'}
          </button>
        </div>
        <div>
          <div className="controls">
            <div className="controls-row">
              <div className="field">
                <label>资源类型</label>
                <select
                  value={type}
                  onChange={(e) => {
                    const next = e.target.value as ResourceType
                    setType(next)
                    setModel(next === 'image' ? IMAGE_MODELS[0] : VIDEO_MODELS[0])
                  }}
                >
                  <option value="image">图片</option>
                  <option value="video">视频</option>
                </select>
              </div>
              <div className="field">
                <label>使用模型</label>
                <select value={model} onChange={(e) => setModel(e.target.value)}>
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>宽高比例</label>
                <select value={ratio} onChange={(e) => setRatio(e.target.value)}>
                  {RATIOS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>生成模式</label>
                <select
                  value={genMode}
                  onChange={(e) => {
                    const mode = e.target.value as GenMode
                    setGenMode(mode)
                    const newLimit = GEN_MODES.find((m) => m.value === mode)?.limit || 4
                    if (references.length > newLimit) {
                      setReferences((prev) => prev.slice(0, newLimit))
                    }
                  }}
                >
                  {GEN_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field" style={{ marginTop: 0 }}>
              <label>参考图片/视频（可多选）</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                multiple={currentLimit > 1}
                style={{ display: 'none' }}
                onChange={handlePickFiles}
              />
              <div className="refs-strip">
                <div className="attachments">
                  {references.length < currentLimit && (
                    <div
                      className="file-add"
                      onClick={() => fileRef.current?.click()}
                      aria-label="添加参考"
                      role="button"
                    >
                      +
                    </div>
                  )}
                  {references.map((a, i) =>
                    a.startsWith('data:video') ? (
                      <div key={i} style={{ position: 'relative' }}>
                        <video src={a} controls />
                        <button
                          className="btn"
                          style={{ position: 'absolute', top: 6, right: 6, padding: '4px 8px' }}
                          onClick={() => handleRemoveRef(i)}
                        >
                          移除
                        </button>
                      </div>
                    ) : (
                      <div key={i} style={{ position: 'relative' }}>
                        <img src={a} alt={`ref-${i}`} />
                        <button
                          className="btn"
                          style={{ position: 'absolute', top: 6, right: 6, padding: '4px 8px' }}
                          onClick={() => handleRemoveRef(i)}
                        >
                          移除
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
