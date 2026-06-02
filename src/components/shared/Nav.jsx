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
      <span className="logo">Bird Tracker</span>
      <NavLink to="/">Home</NavLink>
      <NavLink to="/map">Map</NavLink>
      <NavLink to="/lifelist">Life List</NavLink>
      <NavLink to="/timeline">Timeline</NavLink>
      <NavLink to="/trips">Trips</NavLink>
      <NavLink to="/import">Import</NavLink>
      <NavLink to="/settings">Settings</NavLink>
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
      <button className="secondary" onClick={logout} style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}>
        {user?.display_name} · Logout
      </button>
    </nav>
  )
}
