import { useState, useRef, useEffect } from 'react'

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

// Streaming function to call real API
const streamResponse = async (
  prompt: string, 
  onChunk: (chunk: string) => void
) => {
  const response = await fetch('/api/agent/stream', {
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
  const response = await fetch('/api/agent/resume', {
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

export default function IllustrationVideoGen() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, expandedSteps, isLoading])

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

    // Expand steps by default for new message
    setExpandedSteps(prev => ({ ...prev, [assistantId]: true }))

    try {
      // Use real API for streaming response.
      await streamResponse(input, (chunk) => {
        processStreamChunk(chunk, assistantId)
      })
    } catch (e) {
      console.error(e)
    } finally {
      // Don't set loading false if interrupted, as we wait for user input
      // But here streamResponse ends at interrupt. 
      // Actually we need to know if it ended or interrupted.
      // For now, let's assume if interruptInfo is present, we are still "in a session" but waiting.
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

    try {
      const sessionId = interruptedMsg?.sessionId; 
      if (!sessionId) {
          throw new Error("Session ID not found for resumption");
      }

      await resumeResponse(sessionId, interruptId, reply, (chunk) => {
        processStreamChunk(chunk, newAssistantId)
      })
    } catch (e) {
      console.error(e)
    } finally {
      // Don't set loading false immediately as we wait for stream
    }
  }

  const handleChunk = (msgId: string, chunk: any) => {
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
      // Collapse steps on complete
      setExpandedSteps(prev => ({ ...prev, [msgId]: false }))
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedSteps(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const renderInterruptInfo = (info: any) => {
    if (Array.isArray(info)) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {info.map((item: any, i: number) => (
            <div key={i}>
              {item.text && <div style={{ marginBottom: 4 }}>{item.text}</div>}
              {item.imageUrls && item.imageUrls.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {item.imageUrls.map((url: string, j: number) => (
                    <img 
                      key={j} 
                      src={url} 
                      alt={`img-${i}-${j}`} 
                      style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4, cursor: 'zoom-in' }}
                      onClick={() => window.open(url, '_blank')}
                    />
                  ))}
                </div>
              )}
              {item.videoUrls && item.videoUrls.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  {item.videoUrls.map((url: string, j: number) => (
                    <video 
                      key={j} 
                      src={url} 
                      controls 
                      style={{ width: 100, height: 60, objectFit: 'cover', borderRadius: 4 }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }
    if (typeof info === 'object' && info !== null) {
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
        </div>
      </section>

      <section className="messages">
        {messages.length === 0 && (
          <div style={{ color: '#9ca3af', textAlign: 'center', marginTop: 40 }}>
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
                              
                              if (output?.MessageOutput) {
                                // MessageOutput could be an object, stringify it
                                if (typeof output.MessageOutput === 'object' && output.MessageOutput !== null) {
                                  return JSON.stringify(output.MessageOutput);
                                }
                                return output.MessageOutput;
                              }
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
                      <div className="reply-input" style={{ display: 'flex', gap: '8px' }}>
                        <input 
                          type="text" 
                          placeholder="请输入回复..." 
                          disabled={isLoading}
                          style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #4b5563', background: '#1f2937', color: 'white' }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                              const val = (e.currentTarget as HTMLInputElement).value
                              if (val.trim()) {
                                handleReplyInterrupt(msg.id, msg.interruptId!, val);
                                (e.currentTarget as HTMLInputElement).value = ''
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
                    </div>
                  )}

                  {/* Final Output */}
                  {msg.finalOutput && msg.finalOutput.action !== 'interrupted' && (
                    <div className="final-output" style={{ marginTop: '16px', borderTop: '1px solid #374151', paddingTop: '16px' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#10b981' }}>最终结果</div>
                      {msg.finalOutput.video_url && (
                        <video src={msg.finalOutput.video_url} controls style={{ maxWidth: '100%', borderRadius: '8px' }} />
                      )}
                      <div className="content">{msg.content}</div>
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
                  <span>Agent正在思考中...</span>
               </div>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </section>
    </div>
  )
}
