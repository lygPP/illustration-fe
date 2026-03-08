import { useState } from 'react'
import ChatGenerate from './pages/ChatGenerate'
import IllustrationVideoGen from './pages/IllustrationVideoGen'

export default function App() {
  const [page, setPage] = useState<'chat' | 'illustration'>('chat')

  return (
    <div className="app">
      <header className="app-header">
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <h1 className="creative-title" style={{ marginRight: 20 }}>图片/视频创作</h1>
          <nav className="nav-links">
            <button 
              className={`nav-btn ${page === 'chat' ? 'active' : ''}`}
              onClick={() => setPage('chat')}
            >
              基础生成
            </button>
            <button 
              className={`nav-btn ${page === 'illustration' ? 'active' : ''}`}
              onClick={() => setPage('illustration')}
            >
              插画视频Agent
            </button>
          </nav>
        </div>
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
  )
}

