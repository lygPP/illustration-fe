import { FormEvent, useEffect, useRef, useState } from 'react'
import { apiFetch, parseJsonResponse } from '../api'

interface VoiceProfile {
  id: string
  name: string
  description?: string
  status?: string
  sample_audio_url?: string
  generated_voice_id?: string
  voice_type?: string
  preview_audio_url?: string
  error_message?: string
}

function listPayload(data: unknown) {
  if (!data || typeof data !== 'object') return []
  const value = (data as Record<string, unknown>).voices
  return Array.isArray(value) ? (value as VoiceProfile[]) : []
}

function voicePayload(data: unknown) {
  if (!data || typeof data !== 'object') return null
  const value = (data as Record<string, unknown>).voice
  return value && typeof value === 'object' ? (value as VoiceProfile) : null
}

function microphoneErrorMessage(err: unknown) {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return '当前页面不是安全上下文，浏览器无法启用麦克风。请使用 localhost 或 HTTPS 访问。'
  }
  if (!(err instanceof DOMException)) {
    return err instanceof Error ? err.message : '无法启动麦克风录音'
  }
  if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
    return '麦克风权限被拒绝。请在浏览器地址栏或系统设置中允许当前页面使用麦克风后重试。'
  }
  if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
    return '没有检测到可用麦克风，请连接麦克风后重试。'
  }
  if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
    return '麦克风正被其他应用占用，请关闭占用麦克风的应用后重试。'
  }
  return '无法启动麦克风录音，请检查浏览器麦克风权限。'
}

function preferredRecordingFormat() {
  const candidates = [
    { mimeType: 'audio/ogg;codecs=opus', fileType: 'audio/ogg', ext: 'ogg' },
    { mimeType: 'audio/mp4', fileType: 'audio/mp4', ext: 'm4a' },
    { mimeType: 'audio/webm;codecs=opus', fileType: 'audio/webm', ext: 'webm' },
    { mimeType: 'audio/webm', fileType: 'audio/webm', ext: 'webm' }
  ]
  return candidates.find((item) => MediaRecorder.isTypeSupported(item.mimeType)) ?? candidates[candidates.length - 1]
}

export default function VoiceLibraryPage() {
  const [voices, setVoices] = useState<VoiceProfile[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [customSpeakerId, setCustomSpeakerId] = useState('')
  const [description, setDescription] = useState('')
  const [previewText, setPreviewText] = useState('这是我的专属音色试听。')
  const [sampleFile, setSampleFile] = useState<File | null>(null)
  const [samplePreviewURL, setSamplePreviewURL] = useState('')
  const [editing, setEditing] = useState<VoiceProfile | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const sampleInputRef = useRef<HTMLInputElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<number | null>(null)

  const loadVoices = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch('/api/voices').then((res) => parseJsonResponse<unknown>(res))
      setVoices(listPayload(data))
    } catch (err) {
      setError(err instanceof Error ? err.message : '音色库加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVoices()

    return () => {
      stopRecordingTimer()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      if (samplePreviewURL) URL.revokeObjectURL(samplePreviewURL)
    }
  }, [])

  const stopRecordingTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const setSample = (file: File | null) => {
    if (samplePreviewURL) URL.revokeObjectURL(samplePreviewURL)
    setSampleFile(file)
    setSamplePreviewURL(file ? URL.createObjectURL(file) : '')
  }

  const resetCreateForm = () => {
    setName('')
    setCustomSpeakerId('')
    setDescription('')
    setPreviewText('这是我的专属音色试听。')
    setSample(null)
    setCreateOpen(false)
    setRecording(false)
    setRecordingSeconds(0)
  }

  const submitCreateVoice = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !sampleFile) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('speaker_id', customSpeakerId.trim())
      formData.append('description', description.trim())
      formData.append('preview_text', previewText.trim())
      formData.append('sample', sampleFile)
      const response = await apiFetch('/api/voices/clone-create', {
        method: 'POST',
        body: formData
      })
      const data = await parseJsonResponse<unknown>(response)
      const voice = voicePayload(data)
      setMessage(voice?.status === 'processing' ? '音色已提交复刻，训练完成后可生成试听' : '音色已复刻并保存')
      resetCreateForm()
      await loadVoices()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存音色失败')
    } finally {
      setSaving(false)
    }
  }

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('当前浏览器不支持麦克风录音')
      return
    }
    setError('')
    setMessage('')
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop()
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recordingFormat = preferredRecordingFormat()
      const recorder = new MediaRecorder(stream, { mimeType: recordingFormat.mimeType })
      chunksRef.current = []
      recorderRef.current = recorder
      streamRef.current = stream
      setRecording(true)
      setRecordingSeconds(0)
      stopRecordingTimer()
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((seconds) => seconds + 1)
      }, 1000)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        stopRecordingTimer()
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        const chunks = chunksRef.current
        chunksRef.current = []
        setRecording(false)
        setRecordingSeconds(0)
        if (chunks.length === 0) return
        const blob = new Blob(chunks, { type: recordingFormat.fileType })
        setSample(new File([blob], `voice-recording-${Date.now()}.${recordingFormat.ext}`, { type: recordingFormat.fileType }))
      }
      recorder.start()
    } catch (err) {
      stopRecordingTimer()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setRecording(false)
      setRecordingSeconds(0)
      setError(microphoneErrorMessage(err))
    }
  }

  const stopRecording = () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      setRecording(false)
      stopRecordingTimer()
      return
    }
    recorder.stop()
  }

  const startEdit = (voice: VoiceProfile) => {
    setEditing(voice)
    setEditName(voice.name || '')
    setEditDescription(voice.description || '')
    setMessage('')
    setError('')
  }

  const cancelEdit = () => {
    setEditing(null)
    setEditName('')
    setEditDescription('')
  }

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault()
    if (!editing || !editName.trim()) return
    setBusyId(editing.id)
    setError('')
    setMessage('')
    try {
      const response = await apiFetch(`/api/voices/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), description: editDescription.trim() })
      })
      await parseJsonResponse<unknown>(response)
      setMessage('音色已更新')
      cancelEdit()
      await loadVoices()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新音色失败')
    } finally {
      setBusyId('')
    }
  }

  const runVoiceAction = async (voice: VoiceProfile, action: 'preview' | 'delete') => {
    setBusyId(voice.id)
    setError('')
    setMessage('')
    try {
      let response: Response
      if (action === 'delete') {
        response = await apiFetch(`/api/voices/${voice.id}`, { method: 'DELETE' })
      } else {
        response = await apiFetch(`/api/voices/${voice.id}/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: previewText.trim() || '这是音色试听。' })
        })
      }
      await parseJsonResponse<unknown>(response)
      setMessage(action === 'delete' ? '音色已删除' : '试听已生成')
      await loadVoices()
    } catch (err) {
      setError(err instanceof Error ? err.message : '音色操作失败')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="library-page">
      <section className="library-panel">
        <div className="library-heading compact">
          <button className="btn" type="button" onClick={() => setCreateOpen((value) => !value)}>
            {createOpen ? '收起' : '新建'}
          </button>
        </div>

        {createOpen && (
          <form className="voice-create-form" onSubmit={submitCreateVoice}>
            <div className="voice-form-grid">
              <label>
                音色名称
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：温柔旁白" />
              </label>
              <label>
                音色 ID
                <input value={customSpeakerId} onChange={(e) => setCustomSpeakerId(e.target.value)} placeholder="例如：my_voice_001" />
              </label>
              <label>
                备注
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="声音特点、用途或来源" />
              </label>
            </div>

            <div className="voice-sample-row">
              <input
                ref={sampleInputRef}
                type="file"
                accept="audio/*"
                hidden
                onChange={(e) => {
                  setSample(e.target.files?.[0] || null)
                  e.currentTarget.value = ''
                }}
              />
              <button className="ghost-btn" type="button" onClick={() => sampleInputRef.current?.click()}>
                上传音频样本
              </button>
              {recording ? (
                <button className="ghost-btn recording" type="button" onClick={stopRecording}>
                  停止录音 {recordingSeconds}s
                </button>
              ) : (
                <button className="ghost-btn" type="button" disabled={saving} onClick={startRecording}>
                  麦克风录入
                </button>
              )}
              <span>{sampleFile ? sampleFile.name : '尚未选择样本'}</span>
            </div>

            {samplePreviewURL && <audio className="voice-sample-preview" src={samplePreviewURL} controls />}

            <label className="preview-field">
              试听文本
              <textarea value={previewText} onChange={(e) => setPreviewText(e.target.value)} rows={3} />
            </label>

            <div className="voice-form-actions">
              <button className="btn" disabled={saving || recording || !name.trim() || !sampleFile} type="submit">
                {saving ? '复刻并保存中...' : '保存并复刻音色'}
              </button>
              <button className="ghost-btn" type="button" disabled={saving} onClick={resetCreateForm}>
                取消
              </button>
            </div>
          </form>
        )}

        {error && <div className="form-error">{error}</div>}
        {message && <div className="profile-message">{message}</div>}
      </section>

      <section className="library-panel">
        <div className="section-title">音色列表</div>
        {loading ? (
          <div className="panel-empty">正在加载音色...</div>
        ) : voices.length === 0 ? (
          <div className="panel-empty">还没有音色，先新建一个并完成复刻。</div>
        ) : (
          <div className="voice-list">
            {voices.map((voice) => (
              <article className="voice-item" key={voice.id}>
                <div className="voice-main">
                  {editing?.id === voice.id ? (
                    <form className="voice-edit-form" onSubmit={submitEdit}>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                      <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                      <button className="btn" type="submit" disabled={busyId === voice.id || !editName.trim()}>
                        保存
                      </button>
                      <button className="ghost-btn" type="button" onClick={cancelEdit}>
                        取消
                      </button>
                    </form>
                  ) : (
                    <>
                      <strong>{voice.name}</strong>
                      <p>{voice.description || '暂无描述'}</p>
                    </>
                  )}
                  <div className="history-meta">
                    <span>{voice.status || 'draft'}</span>
                    {voice.voice_type && <span>{voice.voice_type}</span>}
                    {voice.error_message && <span>{voice.error_message}</span>}
                  </div>
                  {voice.sample_audio_url && <audio src={voice.sample_audio_url} controls />}
                  {voice.preview_audio_url && <audio src={voice.preview_audio_url} controls />}
                </div>
                <div className="asset-actions">
                  <button className="ghost-btn" type="button" disabled={busyId === voice.id || !voice.voice_type} onClick={() => runVoiceAction(voice, 'preview')}>
                    生成试听
                  </button>
                  <button className="ghost-btn" type="button" onClick={() => startEdit(voice)}>
                    编辑
                  </button>
                  <button className="ghost-btn danger" type="button" disabled={busyId === voice.id} onClick={() => runVoiceAction(voice, 'delete')}>
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
