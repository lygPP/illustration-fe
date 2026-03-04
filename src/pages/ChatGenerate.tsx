import { useMemo, useRef, useState } from 'react'

type ResourceType = 'image' | 'video'

type Message =
  | { id: string; role: 'user'; content: string; attachments: string[]; meta: { type: ResourceType; model: string; ratio: string } }
  | { id: string; role: 'assistant'; content: string; kind: ResourceType; previewUrl?: string; error?: string }

const IMAGE_MODELS = ['flux-dev', 'sdxl', 'dalle3']
const VIDEO_MODELS = ['pika', 'sora', 'luma']
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

async function mockGenerate(kind: ResourceType): Promise<{ url: string }> {
  if (kind === 'image') {
    const seed = Math.random().toString(36).slice(2)
    return { url: `https://picsum.photos/seed/${seed}/768/768` }
  }
  return { url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' }
}

export default function ChatGenerate() {
  const [type, setType] = useState<ResourceType>('image')
  const [model, setModel] = useState(IMAGE_MODELS[0])
  const [ratio, setRatio] = useState(RATIOS[0])
  const [prompt, setPrompt] = useState('')
  const [references, setReferences] = useState<string[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const modelOptions = useMemo(() => (type === 'image' ? IMAGE_MODELS : VIDEO_MODELS), [type])

  const handlePickFiles = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const base64s = await filesToBase64(ev.target.files)
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
      meta: { type, model, ratio }
    }
    setMessages((m: Message[]) => [...m, userMsg])
    setLoading(true)
    setPrompt('')
    setReferences([])
    try {
      const { url } = await mockGenerate(type)
      const assistant: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: type === 'image' ? '已生成图片' : '已生成视频',
        kind: type,
        previewUrl: url
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
          <div style={{ color: '#9ca3af' }}>开始你的创作吧：选择类型、模型、比例，上传参考，输入提示词发送。</div>
        )}
        {messages.map((msg: Message) => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="message msg-user">
                <div className="bubble">
                  <div className="meta">
                    类型: {msg.meta.type} · 模型: {msg.meta.model} · 比例: {msg.meta.ratio}
                  </div>
                  <div className="content">{msg.content}</div>
                  {msg.attachments?.length > 0 && (
                    <div className="attachments">
                      {msg.attachments.map((a, i) =>
                        a.startsWith('data:video') ? (
                          <video key={i} src={a} controls />
                        ) : (
                          <img key={i} src={a} alt={`ref-${i}`} />
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
                <div className="content">{msg.content}{msg.error ? `：${msg.error}` : ''}</div>
                {msg.previewUrl && (
                  <div className="attachments">
                    {msg.kind === 'image' ? (
                      <img src={msg.previewUrl} alt="result" />
                    ) : (
                      <video src={msg.previewUrl} controls />
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </section>

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
              <label>参考图片/视频（可多选）</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                multiple
                style={{ display: 'none' }}
                onChange={handlePickFiles}
              />
              <div className="refs-strip">
                <div className="attachments">
                  <div
                    className="file-add"
                    onClick={() => fileRef.current?.click()}
                    aria-label="添加参考"
                    role="button"
                  >
                    +
                  </div>
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
