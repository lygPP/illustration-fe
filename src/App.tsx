import { useState } from 'react'
import ChatGenerate from './pages/ChatGenerate'
import IllustrationVideoGen from './pages/IllustrationVideoGen'

export default function App() {
  const [page, setPage] = useState<'chat' | 'illustration'>('chat')

  const title = page === 'chat' ? '图片/视频生成' : '插画视频生成'
  
  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <div className="sidebar-header">
          <h1 className="creative-title" style={{ fontSize: '28px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✨</span> AI创作工坊
          </h1>
        </div>
        <nav className="nav-links">
          <button 
            className={`nav-btn ${page === 'chat' ? 'active' : ''}`}
            onClick={() => setPage('chat')}
          >
            基础工具
          </button>
          <button 
            className={`nav-btn ${page === 'illustration' ? 'active' : ''}`}
            onClick={() => setPage('illustration')}
          >
            插画助手
          </button>
        </nav>
      </aside>
      <div className="app-content">
        <header className="app-header">
          <h2>
            {title.split('').map((char, index) => (
              <span 
                key={index} 
                className="char-span"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {char}
              </span>
            ))}
          </h2>
        </header>
        <main className="app-main">
          {page === 'chat' ? <ChatGenerate /> : <IllustrationVideoGen />}
        </main>
        <footer className="app-footer">
          <small className="footer-text">
            🎨 灵感即刻显现，每一像素都是想象力的延伸
          </small>
        </footer>
      </div>
    </div>
  )
}

