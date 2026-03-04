import ChatGenerate from './pages/ChatGenerate'

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1 className="creative-title">图片/视频创作</h1>
      </header>
      <main className="app-main">
        <ChatGenerate />
      </main>
      <footer className="app-footer">
        <small className="footer-text">
          🎨 灵感即刻显现，每一像素都是想象力的延伸
        </small>
      </footer>
    </div>
  )
}

