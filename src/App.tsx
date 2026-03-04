import ChatGenerate from './pages/ChatGenerate'

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>生成图片/视频的聊天页面</h1>
      </header>
      <main className="app-main">
        <ChatGenerate />
      </main>
      <footer className="app-footer">
        <small>React + TypeScript 示例，上传参考以 base64 传输</small>
      </footer>
    </div>
  )
}

