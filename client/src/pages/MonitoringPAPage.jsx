import React from 'react'

export default function MonitoringPAPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#f8fafc',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          background: 'rgba(15,23,42,0.82)',
          border: '1px solid rgba(148,163,184,0.14)',
          borderRadius: 24,
          padding: 24,
        }}
      >
        <div style={{ color: '#67e8f9', fontSize: 13, fontWeight: 900 }}>PENNSYLVANIA</div>
        <h1 style={{ marginTop: 8 }}>Monitoring dashboard</h1>
        <p style={{ color: '#cbd5e1' }}>
          Pennsylvania monitoring page coming soon.
        </p>

        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => {
              window.location.href = '/'
            }}
            style={{
              height: 44,
              padding: '0 16px',
              borderRadius: 14,
              border: '1px solid rgba(148,163,184,0.18)',
              background: 'rgba(15,23,42,0.8)',
              color: '#e2e8f0',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  )
}
