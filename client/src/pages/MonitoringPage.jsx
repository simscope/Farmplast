import React from 'react'
import { Navigate, useParams } from 'react-router-dom'
import MonitoringNJPage from './MonitoringNJPage'

function MonitoringPAPageStub() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, #0f766e 0%, #031323 24%, #020617 58%, #01030a 100%)',
        color: '#f8fafc',
        padding: 16,
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <button
          onClick={() => {
            window.location.href = '/'
          }}
          style={{
            padding: '10px 16px',
            borderRadius: 12,
            border: '1px solid rgba(148, 163, 184, 0.18)',
            background: 'rgba(15, 23, 42, 0.72)',
            color: '#e2e8f0',
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          ← Back to locations
        </button>

        <div style={{ color: '#67e8f9', fontSize: 13, fontWeight: 900, letterSpacing: 1.2 }}>
          FARMPLAST / PENNSYLVANIA
        </div>

        <h1
          style={{
            margin: '8px 0 8px',
            fontSize: 'clamp(30px, 4vw, 52px)',
            lineHeight: 1.02,
          }}
        >
          Plant HMI Dashboard
        </h1>

        <div style={{ color: '#cbd5e1', fontSize: 15 }}>
          Pennsylvania monitoring page is not connected yet.
        </div>
      </div>
    </div>
  )
}

export default function MonitoringPage() {
  const { location } = useParams()

  if (!location) {
    return <Navigate to="/monitoring/nj" replace />
  }

  const site = String(location).toLowerCase()

  if (site === 'nj') {
    return <MonitoringNJPage />
  }

  if (site === 'pa') {
    return <MonitoringPAPageStub />
  }

  return <Navigate to="/monitoring/nj" replace />
}
