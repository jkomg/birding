import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, createContext, useContext } from 'react'
import Login from './components/Login.jsx'
import Nav from './components/shared/Nav.jsx'
import Dashboard from './components/Dashboard.jsx'
import LifeList from './components/LifeList/LifeList.jsx'
import Timeline from './components/Timeline/Timeline.jsx'
import BirdMap from './components/Map/BirdMap.jsx'
import ImportPage from './components/Import/ImportPage.jsx'
import TripsPage from './components/Trips/TripsPage.jsx'
import SettingsPage from './components/Settings/SettingsPage.jsx'
import SpeciesDetail from './components/Species/SpeciesDetail.jsx'

export const AuthContext = createContext(null)
export const UserFilterContext = createContext({ filter: 'both', setFilter: () => {} })

export function useAuth() { return useContext(AuthContext) }
export function useUserFilter() { return useContext(UserFilterContext) }

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [userFilter, setUserFilter] = useState('both')

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(u => {
        setUser(u)
        if (u) {
          const saved = localStorage.getItem(`userFilter_${u.username}`)
          setUserFilter(saved || 'both')
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function setFilter(f) {
    setUserFilter(f)
    if (user) localStorage.setItem(`userFilter_${user.username}`, f)
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading }}>
      <UserFilterContext.Provider value={{ filter: userFilter, setFilter }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={
            <ProtectedRoute>
              <Nav />
              <main>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/lifelist" element={<LifeList />} />
                  <Route path="/timeline" element={<Timeline />} />
                  <Route path="/map" element={<BirdMap />} />
                  <Route path="/trips" element={<TripsPage />} />
                  <Route path="/import" element={<ImportPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/species/:code" element={<SpeciesDetail />} />
                </Routes>
              </main>
            </ProtectedRoute>
          } />
        </Routes>
      </UserFilterContext.Provider>
    </AuthContext.Provider>
  )
}
