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

export default function VoiceLibraryPage() {
  const [voices, setVoices] = useState<VoiceProfile[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [previewText, setPreviewText] = useState('这是我的专属音色试听。')
  const [editing, setEditing] = useState<VoiceProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [recordingVoiceId, setRecordingVoiceId] = useState('')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const sampleRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const recordingVoiceRef = useRef<VoiceProfile | null>(null)
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
    }
  }, [])

  const stopRecordingTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const resetForm = () => {
    setName('')
    setDescription('')
    setEditing(null)
  }

  const submitVoice = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await apiFetch(editing ? `/api/voices/${editing.id}` : '/api/voices', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() })
      })
      await parseJsonResponse<unknown>(response)
      setMessage(editing ? '音色已更新' : '音色已创建')
      resetForm()
      await loadVoices()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存音色失败')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (voice: VoiceProfile) => {
    setEditing(voice)
    setName(voice.name || '')
    setDescription(voice.description || '')
    setMessage('')
    setError('')
  }

  const uploadSample = async (voice: VoiceProfile, file: File | undefined) => {
    if (!file) return
    setBusyId(voice.id)
    setError('')
    setMessage('')
    try {
      const formData = new FormData()
      formData.append('sample', file)
      const response = await apiFetch(`/api/voices/${voice.id}/sample`, {
        method: 'POST',
        body: formData
      })
      await parseJsonResponse<unknown>(response)
      setMessage('样本音频已上传')
      await loadVoices()
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传样本失败')
    } finally {
      setBusyId('')
    }
  }

  const startRecording = async (voice: VoiceProfile) => {
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
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      recordingVoiceRef.current = voice
      recorderRef.current = recorder
      streamRef.current = stream
      setRecordingVoiceId(voice.id)
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
        const targetVoice = recordingVoiceRef.current
        const chunks = chunksRef.current
        chunksRef.current = []
        recordingVoiceRef.current = null
        setRecordingVoiceId('')
        setRecordingSeconds(0)
        if (!targetVoice || chunks.length === 0) return
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const file = new File([blob], `voice-recording-${Date.now()}.webm`, { type: 'audio/webm' })
        uploadSample(targetVoice, file)
      }
      recorder.start()
    } catch (err) {
      stopRecordingTimer()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setRecordingVoiceId('')
      setRecordingSeconds(0)
      setError(err instanceof Error ? err.message : '无法启动麦克风录音')
    }
  }

  const stopRecording = () => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      setRecordingVoiceId('')
      stopRecordingTimer()
      return
    }
    recorder.stop()
  }

  const runVoiceAction = async (voice: VoiceProfile, action: 'clone' | 'preview' | 'delete') => {
    setBusyId(voice.id)
    setError('')
    setMessage('')
    try {
      let response: Response
      if (action === 'delete') {
        response = await apiFetch(`/api/voices/${voice.id}`, { method: 'DELETE' })
      } else if (action === 'preview') {
        response = await apiFetch(`/api/voices/${voice.id}/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: previewText.trim() || '这是音色试听。' })
        })
      } else {
        response = await apiFetch(`/api/voices/${voice.id}/clone`, { method: 'POST' })
      }
      await parseJsonResponse<unknown>(response)
      setMessage(action === 'delete' ? '音色已删除' : action === 'preview' ? '试听已生成' : '音色复刻已完成')
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
        <div className="section-title">音色资料</div>
        <form className="library-form" onSubmit={submitVoice}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="音色名称" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="声音特点或备注" />
          <button className="btn" disabled={saving || !name.trim()} type="submit">
            {editing ? '保存音色' : '新建音色'}
          </button>
          {editing && (
            <button className="ghost-btn" type="button" onClick={resetForm}>
              取消
            </button>
          )}
        </form>
        <label className="preview-field">
          试听文本
          <input value={previewText} onChange={(e) => setPreviewText(e.target.value)} />
        </label>
        {error && <div className="form-error">{error}</div>}
        {message && <div className="profile-message">{message}</div>}
      </section>

      <section className="library-panel">
        <div className="section-title">我的音色</div>
        {loading ? (
          <div className="panel-empty">正在加载音色...</div>
        ) : voices.length === 0 ? (
          <div className="panel-empty">还没有音色，先创建一个并上传样本音频。</div>
        ) : (
          <div className="voice-list">
            {voices.map((voice) => (
              <article className="voice-item" key={voice.id}>
                <div className="voice-main">
                  <strong>{voice.name}</strong>
                  <p>{voice.description || '暂无描述'}</p>
                  <div className="history-meta">
                    <span>{voice.status || 'draft'}</span>
                    {voice.voice_type && <span>{voice.voice_type}</span>}
                    {voice.error_message && <span>{voice.error_message}</span>}
                  </div>
                  {voice.sample_audio_url && <audio src={voice.sample_audio_url} controls />}
                  {voice.preview_audio_url && <audio src={voice.preview_audio_url} controls />}
                </div>
                <div className="asset-actions">
                  <input
                    ref={(el) => {
                      sampleRefs.current[voice.id] = el
                    }}
                    type="file"
                    accept="audio/*"
                    hidden
                    onChange={(e) => {
                      uploadSample(voice, e.target.files?.[0])
                      e.currentTarget.value = ''
                    }}
                  />
                  <button className="ghost-btn" type="button" disabled={busyId === voice.id} onClick={() => sampleRefs.current[voice.id]?.click()}>
                    上传样本
                  </button>
                  {recordingVoiceId === voice.id ? (
                    <button className="ghost-btn recording" type="button" onClick={stopRecording}>
                      停止录音 {recordingSeconds}s
                    </button>
                  ) : (
                    <button
                      className="ghost-btn"
                      type="button"
                      disabled={Boolean(recordingVoiceId) || busyId === voice.id}
                      onClick={() => startRecording(voice)}
                    >
                      麦克风录入
                    </button>
                  )}
                  <button className="ghost-btn" type="button" disabled={busyId === voice.id || !voice.sample_audio_url} onClick={() => runVoiceAction(voice, 'clone')}>
                    复刻音色
                  </button>
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
