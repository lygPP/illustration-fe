import { FormEvent, useEffect, useRef, useState } from 'react'
import { apiFetch, parseJsonResponse } from '../api'

interface Persona {
  id: string
  name: string
  description?: string
  image_url?: string
  imageUrl?: string
  status?: string
  updated_at?: string
  created_at?: string
}

function listPayload(data: unknown, key: string) {
  if (!data || typeof data !== 'object') return []
  const value = (data as Record<string, unknown>)[key]
  return Array.isArray(value) ? (value as Persona[]) : []
}

function imageUrl(persona: Persona) {
  return persona.image_url || persona.imageUrl || ''
}

export default function PersonaLibraryPage() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [selectedImagePreview, setSelectedImagePreview] = useState('')
  const [editing, setEditing] = useState<Persona | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const loadPersonas = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch('/api/personas').then((res) => parseJsonResponse<unknown>(res))
      setPersonas(listPayload(data, 'personas'))
    } catch (err) {
      setError(err instanceof Error ? err.message : '角色形象加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPersonas()
  }, [])

  const resetForm = () => {
    setName('')
    setDescription('')
    setSelectedImageFile(null)
    setSelectedImagePreview('')
    setEditing(null)
  }

  const handleFormImage = (file: File | undefined) => {
    if (!file) return
    setSelectedImageFile(file)
    setSelectedImagePreview(URL.createObjectURL(file))
  }

  const uploadPersonaImage = async (personaId: string, file: File) => {
    const formData = new FormData()
    formData.append('image', file)
    const response = await apiFetch(`/api/personas/${personaId}/image`, {
      method: 'POST',
      body: formData
    })
    await parseJsonResponse<unknown>(response)
  }

  const submitPersona = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const payload = JSON.stringify({ name: name.trim(), description: description.trim() })
      const response = await apiFetch(editing ? `/api/personas/${editing.id}` : '/api/personas', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      })
      const data = await parseJsonResponse<{ persona?: Persona }>(response)
      const personaId = data.persona?.id || editing?.id
      if (selectedImageFile && personaId) {
        await uploadPersonaImage(personaId, selectedImageFile)
      }
      setMessage(editing ? '角色形象已更新' : '角色形象已创建')
      resetForm()
      await loadPersonas()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存角色形象失败')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (persona: Persona) => {
    setEditing(persona)
    setName(persona.name || '')
    setDescription(persona.description || '')
    setSelectedImageFile(null)
    setSelectedImagePreview(imageUrl(persona))
    setMessage('')
    setError('')
  }

  const uploadImage = async (persona: Persona, file: File | undefined) => {
    if (!file) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await uploadPersonaImage(persona.id, file)
      setMessage('角色参考图已更新')
      await loadPersonas()
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传角色参考图失败')
    } finally {
      setSaving(false)
    }
  }

  const deletePersona = async (persona: Persona) => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await apiFetch(`/api/personas/${persona.id}`, { method: 'DELETE' })
      await parseJsonResponse<unknown>(response)
      setMessage('角色形象已删除')
      await loadPersonas()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除角色形象失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="library-page">
      <section className="library-panel">
        <div className="library-heading">
          <div>
            <div className="section-title">角色形象参考图</div>
            <p>这里不是数字人管理，只用于预先上传角色图片，后续生成图片或视频时可直接作为参考图。</p>
          </div>
        </div>
        <form className="library-form" onSubmit={submitPersona}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="角色名称" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="角色设定、风格或备注" />
          <label className="file-chip">
            选择参考图
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              hidden
              onChange={(e) => {
                handleFormImage(e.target.files?.[0])
                e.currentTarget.value = ''
              }}
            />
          </label>
          <button className="btn" disabled={saving || !name.trim()} type="submit">
            {editing ? '保存角色' : '新建角色'}
          </button>
          {editing && (
            <button className="ghost-btn" type="button" onClick={resetForm}>
              取消
            </button>
          )}
        </form>
        {selectedImagePreview && (
          <div className="form-image-preview">
            <img src={selectedImagePreview} alt="" />
            <span>{selectedImageFile ? selectedImageFile.name : '当前参考图'}</span>
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
        {message && <div className="profile-message">{message}</div>}
      </section>

      <section className="library-panel">
        <div className="section-title">我的角色参考图</div>
        {loading ? (
          <div className="panel-empty">正在加载角色形象...</div>
        ) : personas.length === 0 ? (
          <div className="panel-empty">还没有角色形象，先上传一张常用角色参考图。</div>
        ) : (
          <div className="asset-grid">
            {personas.map((persona) => (
              <article className="asset-card" key={persona.id}>
                <div className="asset-media">
                  {imageUrl(persona) ? <img src={imageUrl(persona)} alt={persona.name} /> : <span>未上传参考图</span>}
                </div>
                <div className="asset-body">
                  <strong>{persona.name}</strong>
                  <p>{persona.description || '暂无描述'}</p>
                  <div className="asset-actions">
                    <input
                      ref={(el) => {
                        fileRefs.current[persona.id] = el
                      }}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      hidden
                      onChange={(e) => {
                        uploadImage(persona, e.target.files?.[0])
                        e.currentTarget.value = ''
                      }}
                    />
                    <button className="ghost-btn" type="button" onClick={() => fileRefs.current[persona.id]?.click()}>
                      替换参考图
                    </button>
                    <button className="ghost-btn" type="button" onClick={() => startEdit(persona)}>
                      编辑
                    </button>
                    <button className="ghost-btn danger" type="button" onClick={() => deletePersona(persona)}>
                      删除
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
