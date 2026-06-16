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

export interface IllustrationRecoverRequest {
  sessionId: string
  input: string
  theme: string
  nonce: number
}

const PAGE_META: Record<AppPage, { title: string; desc: string }> = {
  chat: { title: '图片/视频生成', desc: '按资源类型、模型和参考素材快速生成创作结果。' },
  illustration: { title: '插画视频生成', desc: '通过多 Agent 流程完成故事、分镜、配音与视频生成。' },
  personas: { title: '角色形象', desc: '维护常用角色参考图，作为生成任务的稳定视觉锚点。' },
  voices: { title: '音色库', desc: '管理本地音色样本、试听音频和克隆结果。' },
  users: { title: '用户管理', desc: '查看用户状态、历史记录、用量和资源概况。' },
  profile: { title: '个人主页', desc: '管理账号资料、模型用量和历史创作记录。' }
}

const NAV_ITEMS: Array<{ page: AppPage; label: string; icon: string }> = [
  { page: 'chat', label: '基础工具', icon: '基' },
  { page: 'illustration', label: '插画助手', icon: '绘' },
  { page: 'personas', label: '角色形象', icon: '角' },
  { page: 'voices', label: '音色库', icon: '音' },
  { page: 'users', label: '用户管理', icon: '管' }
]

function displayUserName(user: { nickname?: string; username?: string; name?: string; email?: string } | null) {
  return user?.nickname || user?.username || user?.name || user?.email || '已登录用户'
}

function userAvatarUrl(user: { avatar_url?: string; avatarUrl?: string } | null) {
  return user?.avatar_url || user?.avatarUrl || ''
}

export default function App() {
  const { authLoading, token, user, logout } = useAuth()
  const [page, setPage] = useState<AppPage>('chat')
  const [recoverRequest, setRecoverRequest] = useState<IllustrationRecoverRequest | null>(null)

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

  const pageMeta = PAGE_META[page]
  const userName = displayUserName(user)
  const avatarUrl = userAvatarUrl(user)
  const isSuperAdmin = user?.role === 'super_admin'
  const handleRecoverAgentWork = (request: Omit<IllustrationRecoverRequest, 'nonce'>) => {
    setRecoverRequest({ ...request, nonce: Date.now() })
    setPage('illustration')
  }
  
  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <div className="sidebar-header">
          <div className="brand-mark" aria-hidden="true">A</div>
          <div>
            <h1 className="creative-title">AI创作工坊</h1>
            <p>Story Atelier</p>
          </div>
        </div>
        <nav className="nav-links">
          {NAV_ITEMS.filter((item) => item.page !== 'users' || isSuperAdmin).map((item) => (
            <button
              key={item.page}
              className={`nav-btn ${page === item.page ? 'active' : ''}`}
              onClick={() => setPage(item.page)}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
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
          <div>
            <p className="page-kicker">Creative workspace</p>
            <h2>{pageMeta.title}</h2>
            <span>{pageMeta.desc}</span>
          </div>
          <div className="header-status" aria-label="当前登录用户">
            <span className="status-dot" aria-hidden="true" />
            <span>{userName}</span>
          </div>
        </header>
        <main className="app-main">
          {page === 'chat' && <ChatGenerate />}
          {page === 'illustration' && <IllustrationVideoGen recoverRequest={recoverRequest} />}
          {page === 'personas' && <PersonaLibraryPage />}
          {page === 'voices' && <VoiceLibraryPage />}
          {page === 'users' && <UserManagementPage />}
          {page === 'profile' && <ProfilePage onRecoverAgentWork={handleRecoverAgentWork} />}
        </main>
        <footer className="app-footer">
          <small className="footer-text">
            Warm Story Atelier
          </small>
        </footer>
      </div>
    </div>
  )
}
