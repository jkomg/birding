import { NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth, useUserFilter } from '../../App.jsx'

export default function Nav() {
  const { user, setUser } = useAuth()
  const { filter, setFilter } = useUserFilter()
  const navigate = useNavigate()
  const [allUsers, setAllUsers] = useState([])

  useEffect(() => {
    if (user) {
      fetch('/api/users', { credentials: 'include' })
        .then(r => r.json())
        .then(setAllUsers)
        .catch(() => {})
    }
  }, [user])

  async function logout() {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
    navigate('/login')
  }

  // Build toggle: [me] [both] [other]
  const me = allUsers.find(u2 => u2.username === user?.username)
  const others = allUsers.filter(u2 => u2.username !== user?.username)

  return (
    <nav>
      <span className="logo">🐦 Birds</span>
      <NavLink to="/">Home</NavLink>
      <NavLink to="/map">Map</NavLink>
      <NavLink to="/lifelist">Life List</NavLink>
      <NavLink to="/timeline">Timeline</NavLink>
      <NavLink to="/trips">Trips</NavLink>
      <NavLink to="/import">Import</NavLink>
      <NavLink to="/settings">Settings</NavLink>
      <div className="user-toggle">
        {me && (
          <button className={filter === me.username ? 'active' : ''} onClick={() => setFilter(me.username)}>
            Me
          </button>
        )}
        <button className={filter === 'both' ? 'active' : ''} onClick={() => setFilter('both')}>
          Both
        </button>
        {others.map(u2 => (
          <button key={u2.username} className={filter === u2.username ? 'active' : ''} onClick={() => setFilter(u2.username)}>
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
