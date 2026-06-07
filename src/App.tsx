import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import ChatGenerate from './pages/ChatGenerate'
import IllustrationVideoGen from './pages/IllustrationVideoGen'
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import PersonaLibraryPage from './pages/PersonaLibraryPage'
import VoiceLibraryPage from './pages/VoiceLibraryPage'
import UserManagementPage from './pages/UserManagementPage'

type AppPage = 'chat' | 'illustration' | 'personas' | 'voices' | 'users' | 'profile'

const PAGE_TITLES: Record<AppPage, string> = {
  chat: '图片/视频生成',
  illustration: '插画视频生成',
  personas: '角色形象',
  voices: '音色库',
  users: '用户管理',
  profile: '个人主页'
}

function displayUserName(user: { nickname?: string; username?: string; name?: string; email?: string } | null) {
  return user?.nickname || user?.username || user?.name || user?.email || '已登录用户'
}

function userAvatarUrl(user: { avatar_url?: string; avatarUrl?: string } | null) {
  return user?.avatar_url || user?.avatarUrl || ''
}

export default function App() {
  const { authLoading, token, user, logout } = useAuth()
  const [page, setPage] = useState<AppPage>('chat')

  useEffect(() => {
    if (!token) setPage('chat')
  }, [token])

  if (authLoading) {
    return (
      <div className="auth-shell">
        <div className="panel-empty">正在确认登录状态...</div>
      </div>
    )
  }

  if (!token) {
    return <AuthPage />
  }

  const title = PAGE_TITLES[page]
  const userName = displayUserName(user)
  const avatarUrl = userAvatarUrl(user)
  const isSuperAdmin = user?.role === 'super_admin'
  
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
          <button
            className={`nav-btn ${page === 'personas' ? 'active' : ''}`}
            onClick={() => setPage('personas')}
          >
            角色形象
          </button>
          <button
            className={`nav-btn ${page === 'voices' ? 'active' : ''}`}
            onClick={() => setPage('voices')}
          >
            音色库
          </button>
          {isSuperAdmin && (
            <button
              className={`nav-btn ${page === 'users' ? 'active' : ''}`}
              onClick={() => setPage('users')}
            >
              用户管理
            </button>
          )}
        </nav>
        <div className="sidebar-account">
          <button
            type="button"
            className={`account-entry ${page === 'profile' ? 'active' : ''}`}
            onClick={() => setPage('profile')}
            aria-label="进入个人主页"
          >
            <span className="account-avatar">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : String(userName).slice(0, 1).toUpperCase()}
            </span>
            <span className="account-copy">
              <span>{String(userName)}</span>
              <small>当前账号</small>
            </span>
          </button>
          <button className="logout-btn" type="button" onClick={logout}>
            退出
          </button>
        </div>
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
          {page === 'chat' && <ChatGenerate />}
          {page === 'illustration' && <IllustrationVideoGen />}
          {page === 'personas' && <PersonaLibraryPage />}
          {page === 'voices' && <VoiceLibraryPage />}
          {page === 'users' && <UserManagementPage />}
          {page === 'profile' && <ProfilePage />}
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
