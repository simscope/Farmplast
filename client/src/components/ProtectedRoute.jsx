import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, roles = [] }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#020817',
          color: '#ffffff',
          fontFamily: 'Arial, sans-serif',
          fontSize: '18px',
        }}
      >
        Loading...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (roles.length > 0) {
    const currentRole = profile?.role || 'user'

    if (!roles.includes(currentRole)) {
      return <Navigate to="/login" replace />
    }
  }

  return children
}
