import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, roles = [] }) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#020817',
          color: 'white',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        Loading...
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (roles.length > 0) {
    if (!profile) {
      return (
        <div
          style={{
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#020817',
            color: 'white',
            fontFamily: 'Arial, sans-serif',
          }}
        >
          Loading profile...
        </div>
      )
    }

    if (!roles.includes(profile.role)) {
      return <Navigate to="/login" replace />
    }
  }

  return children
}
