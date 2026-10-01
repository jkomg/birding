import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth, useUsers, useUserFilter, getScopeLabel } from '../../App.jsx'

export default function Nav() {
  const { user, setUser } = useAuth()
  const users = useUsers()
  const { filter, setFilter } = useUserFilter()
  const navigate = useNavigate()

  async function logout() {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
    navigate('/login')
  }

  const scopeLabel = getScopeLabel(filter, user, users)

  return (
    <nav>
      <NavLink className="logo" to="/">Field Notes</NavLink>
      <div className="nav-links">
        <NavLink to="/" end><span className="nav-icon">⌂</span><span>Today</span></NavLink>
        <NavLink to="/map"><span className="nav-icon">⌖</span><span>Map</span></NavLink>
        <NavLink to="/lifelist"><span className="nav-icon">✦</span><span>Life list</span></NavLink>
        <NavLink to="/outings"><span className="nav-icon">☷</span><span>Outings</span></NavLink>
        <NavLink to="/trips"><span className="nav-icon">↗</span><span>Plans</span></NavLink>
      </div>
      <div className="user-toggle">
        <div className="user-toggle-label">{scopeLabel}</div>
        <button className={filter === 'both' ? 'active' : ''} onClick={() => setFilter('both')} aria-pressed={filter === 'both'}>
          All
        </button>
        {users.map(u2 => (
          <button key={u2.username} className={filter === u2.username ? 'active' : ''} onClick={() => setFilter(u2.username)} aria-pressed={filter === u2.username}>
            {u2.display_name}
          </button>
        ))}
      </div>
      <div className="nav-account">
        <NavLink to="/settings" className="nav-settings" aria-label="Settings">⚙</NavLink>
        <button className="account-button" onClick={logout}>{user?.display_name?.split(' ')[0]} <span>↪</span></button>
      </div>
    </nav>
  )
}
