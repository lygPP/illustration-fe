import { useState, useRef, useEffect } from 'react'
import { apiFetch } from '../api'
import type { IllustrationRecoverRequest } from '../App'

interface AgentStep {
  agent_name: string
  output: any
  action: string
  timestamp: number
  message: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  steps?: AgentStep[]
  interruptInfo?: string
  interruptId?: string
  isStreaming?: boolean
  finalOutput?: any
  sessionId?: string
}

interface VoiceOption {
  value: string
  label: string
  description?: string
  previewAudioUrl?: string
}

interface IllustrationVideoGenProps {
  recoverRequest?: IllustrationRecoverRequest | null
}

// Streaming function to call real API
const streamResponse = async (
  prompt: string, 
  onChunk: (chunk: string) => void
) => {
  const response = await apiFetch('/api/agent/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ theme: prompt }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No readable stream available');
  }

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    onChunk(chunk);
  }
}

const resumeResponse = async (
  sessionId: string,
  interruptId: string,
  reply: string,
  onChunk: (chunk: string) => void
) => {
  const response = await apiFetch('/api/agent/resume', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      session_id: sessionId,
      interrupt_id: interruptId,
      input: reply
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No readable stream available');
  }

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    onChunk(chunk);
  }
}

const recoverResponse = async (
  sessionId: string,
  reply: string,
  onChunk: (chunk: string) => void
) => {
  const response = await apiFetch('/api/agent/recover', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: sessionId,
      input: reply
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No readable stream available');
  }

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    onChunk(chunk);
  }
}

const stopAgent = async (sessionId: string) => {
  const response = await apiFetch('/api/agent/stop', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id: sessionId }),
  })
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`)
  }
}

function VoiceSelectReply({
  disabled,
  options,
  onSubmit
}: {
  disabled: boolean
  options: VoiceOption[]
  onSubmit: (value: string) => void
}) {
  const [selected, setSelected] = useState(options[0]?.value || '')
  const selectedOption = options.find((item) => item.value === selected)

  return (
    <div className="reply-input" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={selected}
          disabled={disabled}
          onChange={(event) => setSelected(event.target.value)}
          style={{
            flex: '1 1 240px',
            minWidth: 0,
            padding: '9px 10px',
            borderRadius: '4px',
            border: '1px solid #4b5563',
            background: '#1f2937',
            color: 'white'
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button className="btn" disabled={disabled || !selected} onClick={() => selected && onSubmit(selected)}>
          使用该音色
        </button>
      </div>
      {selectedOption?.description && (
        <div style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.5 }}>{selectedOption.description}</div>
      )}
      {selectedOption?.previewAudioUrl && (
        <audio src={selectedOption.previewAudioUrl} controls style={{ width: '100%', maxWidth: 360 }} />
      )}
    </div>
  )
}

export default function IllustrationVideoGen({ recoverRequest }: IllustrationVideoGenProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState('')
  const [stopError, setStopError] = useState('')
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})
  const [previewMedia, setPreviewMedia] = useState<{ type: 'image' | 'video'; url: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const handledRecoverNonce = useRef<number | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
	  }, [messages, expandedSteps, isLoading])

  useEffect(() => {
    if (!recoverRequest || handledRecoverNonce.current === recoverRequest.nonce) return
    handledRecoverNonce.current = recoverRequest.nonce
    setInput(recoverRequest.input)
    void handleRecoverRequest(recoverRequest)
  }, [recoverRequest])

  const processStreamChunk = (chunk: string, msgId: string) => {
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('data:')) {
          const jsonStr = line.trim().slice(5).trim();
          try {
            const data = JSON.parse(jsonStr);
            handleChunk(msgId, data);
          } catch (e) {
            console.error('Error parsing JSON', e);
          }
        }
      }
  }

  const handleSend = async () => {
    if (!input.trim() || isLoading) return
    
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input
    }
    
    const assistantId = crypto.randomUUID()
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      steps: [],
      isStreaming: true
    }
    
    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setIsLoading(true)
    setActiveSessionId('')
    setStopError('')

    // Expand steps by default for new message
    setExpandedSteps(prev => ({ ...prev, [assistantId]: true }))

    try {
      // Use real API for streaming response.
      await streamResponse(input, (chunk) => {
        processStreamChunk(chunk, assistantId)
      })
    } catch (e) {
      console.error(e)
      setMessages(prev => prev.map(msg => {
        if (msg.id !== assistantId) return msg
        return {
          ...msg,
          isStreaming: false,
          content: e instanceof Error ? e.message : '生成失败',
          finalOutput: { action: 'failed' }
        }
      }))
      setIsLoading(false)
      setActiveSessionId('')
    } finally {
      // Don't set loading false if interrupted, as we wait for user input
      // But here streamResponse ends at interrupt. 
      // Actually we need to know if it ended or interrupted.
      // For now, let's assume if interruptInfo is present, we are still "in a session" but waiting.
    }
  }

  const handleRecoverRequest = async (request: IllustrationRecoverRequest) => {
    if (!request.input.trim() || isLoading) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `恢复历史插画任务：${request.theme}\n${request.input}`,
      sessionId: request.sessionId
    }

    const assistantId = crypto.randomUUID()
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      steps: [],
      isStreaming: true,
      sessionId: request.sessionId
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setIsLoading(true)
    setActiveSessionId(request.sessionId)
    setStopError('')
    setExpandedSteps(prev => ({ ...prev, [assistantId]: true }))

    try {
      await recoverResponse(request.sessionId, request.input, (chunk) => {
        processStreamChunk(chunk, assistantId)
      })
    } catch (e) {
      console.error(e)
      setMessages(prev => prev.map(msg => {
        if (msg.id !== assistantId) return msg
        return {
          ...msg,
          isStreaming: false,
          content: e instanceof Error ? e.message : '恢复执行失败',
          finalOutput: { action: 'failed' }
        }
      }))
      setIsLoading(false)
      setActiveSessionId('')
    }
  }

  const handleReplyInterrupt = async (msgId: string, interruptId: string, reply: string) => {
    if (!reply.trim()) return

    // Add user reply to messages
    const replyMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: reply
    }
    setMessages(prev => [...prev, replyMsg])
    
    // Find the session ID from the message that was interrupted. 
    const interruptedMsg = messages.find(m => m.id === msgId);
    
    // Resume streaming for a NEW assistant message
    const newAssistantId = crypto.randomUUID()
    const newAssistantMsg: Message = {
      id: newAssistantId,
      role: 'assistant',
      content: '',
      steps: [],
      isStreaming: true
    }
    setMessages(prev => [...prev, newAssistantMsg])
    setExpandedSteps(prev => ({ ...prev, [newAssistantId]: true }))

    setIsLoading(true)
    setStopError('')

    try {
      const sessionId = interruptedMsg?.sessionId
      if (!sessionId) {
        throw new Error("Session ID not found for resumption")
      }

      setActiveSessionId(sessionId)

      await resumeResponse(sessionId, interruptId, reply, (chunk) => {
        processStreamChunk(chunk, newAssistantId)
      })
    } catch (e) {
      console.error(e)
      setMessages(prev => prev.map(msg => {
        if (msg.id !== newAssistantId) return msg
        return {
          ...msg,
          isStreaming: false,
          content: e instanceof Error ? e.message : '恢复反馈失败',
          finalOutput: { action: 'failed' }
        }
      }))
      setIsLoading(false)
      setActiveSessionId('')
    } finally {
      // Don't set loading false immediately as we wait for stream
    }
  }

  const handleStop = async () => {
    if (!activeSessionId || !isLoading) return
    setStopError('')
    try {
      await stopAgent(activeSessionId)
      setIsLoading(false)
      setActiveSessionId('')
      setMessages(prev => prev.map(msg => (
        msg.isStreaming
          ? { ...msg, isStreaming: false, content: msg.content || '流程已手动停止', finalOutput: { action: 'canceled' } }
          : msg
      )))
    } catch (e) {
      setStopError(e instanceof Error ? e.message : '停止流程失败')
    }
  }

  const handleChunk = (msgId: string, chunk: any) => {
    if (chunk.session_id) {
      setActiveSessionId(chunk.session_id)
    }

    if ((chunk.type === 'event' || chunk.type === 'connected') && chunk.data?.output?.CustomizedOutput?.interrupt_info) {
      setIsLoading(false)
    }

    setMessages(prev => prev.map(msg => {
      if (msg.id !== msgId) return msg

      if (chunk.type === 'event' || chunk.type === 'connected') {
        const data = chunk.data
        if (!data && chunk.type !== 'connected') return msg // connected might have null data

        const step: AgentStep = {
          agent_name: data?.agent_name || 'Agent',
          output: data?.output,
          action: chunk.type,
          message: chunk.message || '执行成功',
          timestamp: Date.now()
        }
        
        let interruptInfo = undefined
        let interruptId = undefined
        
        if (data?.output?.CustomizedOutput?.interrupt_info) {
          interruptInfo = data.output.CustomizedOutput.interrupt_info
          interruptId = data.output.CustomizedOutput.interrupt_id
        }

        return {
          ...msg,
          steps: [...(msg.steps || []), step],
          interruptInfo,
          interruptId,
          sessionId: chunk.session_id || msg.sessionId
        }
      } else if (chunk.type === 'complete') {
        const data = chunk.data
        let finalOutput = data
        let content = chunk.message || '执行完成'
        let interruptInfo = msg.interruptInfo
        let interruptId = msg.interruptId

        if (data?.output?.CustomizedOutput) {
             content = data.output.CustomizedOutput.interrupt_info || '执行完成'
             interruptInfo = data.output.CustomizedOutput.interrupt_info
             if (data.action === 'interrupted') {
                 interruptInfo = data.output.CustomizedOutput.interrupt_info
                 interruptId = data.output.CustomizedOutput.interrupt_id
             }
        }

        return {
          ...msg,
          isStreaming: false,
          finalOutput,
          content,
          sessionId: chunk.session_id || msg.sessionId,
          interruptInfo,
          interruptId
        }
      }
      return msg
    }))
    
	    if (chunk.type === 'complete') {
	      setIsLoading(false)
        setActiveSessionId('')
	      // Collapse steps on complete
      setExpandedSteps(prev => ({ ...prev, [msgId]: false }))
    }
  }

	  const toggleExpand = (id: string) => {
	    setExpandedSteps(prev => ({ ...prev, [id]: !prev[id] }))
	  }

  const voiceOptionsFromInterrupt = (info: any): VoiceOption[] => {
    if (!Array.isArray(info)) return []
    return info
      .filter((item: any) => item && (item.voiceId || item.voiceName || item.voiceIndex))
      .map((item: any) => {
        const value = String(item.voiceId || item.voiceName || item.voiceIndex || '').trim()
        const name = String(item.voiceName || item.text || value).trim()
        const index = item.voiceIndex ? `${item.voiceIndex}. ` : ''
        return {
          value,
          label: `${index}${name}`,
          description: item.description,
          previewAudioUrl: item.previewAudioUrl
        }
      })
      .filter((item) => item.value)
  }

  const renderInterruptInfo = (info: any) => {
    const renderChapterStory = (item: any) => (
      <div style={{
        border: '1px solid #475569',
        borderRadius: 6,
        padding: '10px 12px',
        background: 'rgba(15, 23, 42, 0.68)',
        marginBottom: 4
      }}>
        <div style={{ color: '#93c5fd', fontWeight: 700, marginBottom: 6 }}>
          第{Number(item.chapterIndex ?? 0) + 1}章故事内容
        </div>
        {item.chapterTitle && (
          <div style={{ color: '#e5e7eb', fontWeight: 700, marginBottom: 4 }}>
            {item.chapterTitle}
          </div>
        )}
        {item.chapterContent && (
          <div style={{ color: '#cbd5e1', fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
            {item.chapterContent}
          </div>
        )}
      </div>
    )

    const renderCharacterRefs = (refs: any[]) => (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
        {refs.map((character: any, i: number) => (
          <div key={character.id || i} style={{ border: '1px solid #334155', borderRadius: 6, padding: 10, background: 'rgba(15, 23, 42, 0.65)' }}>
            {character.imageUrls && character.imageUrls.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {character.imageUrls.map((url: string, j: number) => (
                  <img
                    key={j}
                    src={url}
                    alt={`${character.name || 'character'}-${j}`}
                    style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4, cursor: 'zoom-in' }}
                    onClick={() => setPreviewMedia({ type: 'image', url })}
                  />
                ))}
              </div>
            )}
            <div style={{ color: '#e5e7eb', fontWeight: 700 }}>{character.name || `角色 ${i + 1}`}</div>
            {character.role && <div style={{ color: '#93c5fd', fontSize: 12, marginTop: 2 }}>{character.role}</div>}
            {character.description && <div style={{ color: '#cbd5e1', fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>{character.description}</div>}
          </div>
        ))}
      </div>
    )

    if (Array.isArray(info)) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {info.map((item: any, i: number) => (
            <div key={i}>
              {item.text && <div style={{ marginBottom: 4 }}>{item.text}</div>}
              {(item.chapterTitle || item.chapterContent) && renderChapterStory(item)}
              {item.characterRefs && item.characterRefs.length > 0 && renderCharacterRefs(item.characterRefs)}
              {item.imageUrls && item.imageUrls.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {item.imageUrls.map((url: string, j: number) => (
                    <img 
                      key={j} 
                      src={url} 
                      alt={`img-${i}-${j}`} 
                      style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4, cursor: 'zoom-in' }}
                      onClick={() => setPreviewMedia({ type: 'image', url })}
                    />
                  ))}
                </div>
              )}
              {item.videoUrls && item.videoUrls.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  {item.videoUrls.map((url: string, j: number) => (
                    <div 
                      key={j} 
                      style={{ position: 'relative', width: 100, height: 60, cursor: 'pointer' }}
                      onClick={() => setPreviewMedia({ type: 'video', url })}
                    >
                      <video 
                        src={url} 
                        muted
                        loop
                        onMouseOver={(e) => e.currentTarget.play()}
                        onMouseOut={(e) => e.currentTarget.pause()}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
                      />
                      <div style={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'
                      }}>
                        <span style={{ fontSize: '10px', color: 'white', marginLeft: 2 }}>▶</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {item.audioUrls && item.audioUrls.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {item.audioUrls.map((url: string, j: number) => (
                    <audio key={j} src={url} controls style={{ width: '100%', maxWidth: 360 }} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }
    if (typeof info === 'object' && info !== null) {
      if (info.chapterTitle || info.chapterContent) {
        return renderChapterStory(info);
      }
      if (info.characterRefs && info.characterRefs.length > 0) {
        return renderCharacterRefs(info.characterRefs);
      }
      return JSON.stringify(info);
    }
    return info;
  };

  return (
    <div className="chat-wrap">
      <section className="composer" style={{ borderBottom: '1px solid #1f2937', paddingBottom: '20px' }}>
        <div className="prompt">
          <textarea
            placeholder="输入主题，开始生成插画视频..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
	          <button className="btn" disabled={isLoading || !input.trim()} onClick={handleSend}>
	            {isLoading ? '生成中...' : '发送'}
	          </button>
          {isLoading && (
            <button className="ghost-btn danger" type="button" disabled={!activeSessionId} onClick={handleStop}>
              停止
            </button>
          )}
	        </div>
        {stopError && <div className="form-error" style={{ marginTop: 10 }}>{stopError}</div>}
	      </section>

      <section className="messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <span style={{ fontSize: 48, marginBottom: 20 }}>🎬</span>
            请输入主题，Agent 将为您生成插画视频。
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.role === 'user' ? 'msg-user' : ''}`}>
            <div className={`bubble ${msg.role === 'assistant' ? 'assistant' : ''}`} style={{ width: msg.role === 'assistant' ? '100%' : 'auto', maxWidth: msg.role === 'assistant' ? '100%' : '80%' }}>
              <div className="meta">
                {msg.role === 'user' ? 'User' : 'Agent System'}
              </div>
              
              {msg.role === 'assistant' && (
                <div className="agent-process">
                  {/* Process Header / Toggle */}
                  {msg.steps && msg.steps.length > 0 && (
                     <div 
                       className="process-header" 
                       onClick={() => toggleExpand(msg.id)}
                       style={{ 
                         cursor: 'pointer', 
                         padding: '8px', 
                         background: 'rgba(0,0,0,0.2)', 
                         borderRadius: '4px',
                         marginBottom: '8px',
                         display: 'flex',
                         justifyContent: 'space-between',
                         alignItems: 'center'
                       }}
                     >
                       <span>执行过程 ({msg.steps.length} 步)</span>
                       <span>{expandedSteps[msg.id] ? '▼' : '▶'}</span>
                     </div>
                  )}

                  {/* Steps List */}
                  {expandedSteps[msg.id] && (
                    <div className="steps-list" style={{ paddingLeft: '10px', borderLeft: '2px solid #333', marginBottom: '10px' }}>
                      {msg.steps?.map((step, idx) => (
                        <div key={idx} className="step-item" style={{ marginBottom: '8px', fontSize: '0.9em' }}>
                          <div style={{ color: '#60a5fa', fontWeight: 'bold' }}>{step.agent_name}</div>
                          <div style={{ color: '#9ca3af' }}>{
                            (() => {
                              const output = step.output;
                              // Handle CustomizedOutput.interrupt_info as a map list
                              if (output?.CustomizedOutput && output.CustomizedOutput.interrupt_info) {
                                return renderInterruptInfo(output.CustomizedOutput.interrupt_info);
                              }
                              
                              // if (output?.MessageOutput) {
                              //   // MessageOutput could be an object, stringify it
                              //   if (typeof output.MessageOutput === 'object' && output.MessageOutput !== null) {
                              //     return JSON.stringify(output.MessageOutput);
                              //   }
                              //   return output.MessageOutput;
                              // }
                              // If CustomizedOutput exists but interrupt_info is empty string or undefined
                              if (output?.CustomizedOutput) {
                                const info = output.CustomizedOutput.interrupt_info;
                                if (typeof info === 'object' && info !== null) return JSON.stringify(info);
                                return info || '执行完成';
                              }
                              
                              // Default to message field if no output
                              return step.message || '执行完成';
                            })()
                          }</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Interrupt Interaction */}
                  {msg.interruptInfo && (!msg.finalOutput || msg.finalOutput.action === 'interrupted') && (
                    <div className="interrupt-box" style={{
                      border: '1px solid #d97706',
                      background: 'rgba(217, 119, 6, 0.1)',
                      padding: '12px',
                      borderRadius: '8px',
                      marginTop: '10px'
                    }}>
                      <div style={{ whiteSpace: 'pre-wrap', marginBottom: '10px' }}>
                        {renderInterruptInfo(msg.interruptInfo)}
                      </div>
                        {voiceOptionsFromInterrupt(msg.interruptInfo).length > 0 ? (
                          <VoiceSelectReply
                            disabled={isLoading}
                            options={voiceOptionsFromInterrupt(msg.interruptInfo)}
                            onSubmit={(value) => handleReplyInterrupt(msg.id, msg.interruptId!, value)}
                          />
                        ) : (
                          <div className="reply-input" style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="text"
                              placeholder="请输入回复..."
                              defaultValue="ok"
                              disabled={isLoading}
                              style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #4b5563', background: '#1f2937', color: 'white' }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                  const val = (e.currentTarget as HTMLInputElement).value
                                  if (val.trim()) {
                                    handleReplyInterrupt(msg.id, msg.interruptId!, val)
                                    ;(e.currentTarget as HTMLInputElement).value = ''
                                  }
                                }
                              }}
                            />
                            <button
                              className="btn"
                              disabled={isLoading}
                              onClick={(e) => {
                                const inputEl = (e.target as HTMLElement).previousElementSibling as HTMLInputElement
                                if (inputEl.value.trim()) {
                                  handleReplyInterrupt(msg.id, msg.interruptId!, inputEl.value)
                                  inputEl.value = ''
                                }
                              }}
                            >
                              回复
                            </button>
                          </div>
                        )}
                    </div>
                  )}

                  {/* Final Output */}
                  {msg.finalOutput && msg.finalOutput.action !== 'interrupted' && (
                    <div className="final-output" style={{ marginTop: '16px', borderTop: '1px solid #374151', paddingTop: '16px' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#10b981' }}>最终结果</div>
                      {msg.interruptInfo ? (
                        renderInterruptInfo(msg.interruptInfo)
                      ) : (
                        <div className="content">{msg.content}</div>
                      )}
                      {/* {msg.finalOutput.video_url && (
                        <video src={msg.finalOutput.video_url} controls style={{ maxWidth: '100%', borderRadius: '8px' }} />
                      )}
                      <div className="content">{msg.content}</div> */}
                    </div>
                  )}
                </div>
              )}
              
              {msg.role === 'user' && <div className="content">{msg.content}</div>}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="message">
             <div className="bubble assistant">
               <div className="generating-loader">
                  <div className="dots-container">
                    <div className="dot" />
                    <div className="dot" />
                    <div className="dot" />
                  </div>
                  <span>Agent正在执行中...</span>
               </div>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </section>

      {/* Media Preview Modal */}
      {previewMedia && (
        <div 
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(5px)'
          }} 
          onClick={() => setPreviewMedia(null)}
        >
          <div 
            style={{ position: 'relative', width: '90%', maxWidth: '1000px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }} 
            onClick={e => e.stopPropagation()}
          >
            {previewMedia.type === 'video' ? (
              <video
                src={previewMedia.url}
                controls
                autoPlay
                style={{ width: '100%', maxHeight: '85vh', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
              />
            ) : (
              <img
                src={previewMedia.url}
                alt="preview"
                style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
              />
            )}
            <button
              onClick={() => setPreviewMedia(null)}
              style={{
                position: 'absolute', top: -40, right: 0,
                background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%',
                width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontSize: '18px', cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.4)'}
              onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
