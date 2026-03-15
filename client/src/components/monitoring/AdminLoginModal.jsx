import React from 'react'
import { X } from 'lucide-react'

export default function AdminLoginModal({
  open,
  password,
  setPassword,
  error,
  onClose,
  onSubmit,
  isMobile,
}) {
  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2,6,23,0.78)',
        backdropFilter: 'blur(6px)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 2000,
        padding: isMobile ? 12 : 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'linear-gradient(180deg, rgba(15,23,42,0.96) 0%, rgba(2,6,23,0.98) 100%)',
          border: '1px solid rgba(103,232,249,0.18)',
          borderRadius: 24,
          padding: isMobile ? 18 : 22,
          boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
          color: '#f8fafc',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>
              SECURE ACCESS
            </div>
            <div style={{ marginTop: 6, fontSize: isMobile ? 22 : 26, fontWeight: 900 }}>
              Administrator login
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              border: '1px solid rgba(148,163,184,0.18)',
              background: 'rgba(15,23,42,0.8)',
              color: '#cbd5e1',
              borderRadius: 12,
              width: 40,
              height: 40,
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ marginTop: 18, color: '#cbd5e1', fontSize: 14 }}>
          Enter administrator password to continue.
        </div>

        <div style={{ marginTop: 18 }}>
          <label
            style={{
              display: 'block',
              marginBottom: 8,
              fontSize: 13,
              fontWeight: 800,
              color: '#cbd5e1',
            }}
          >
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit()
            }}
            autoFocus
            style={{
              width: '100%',
              height: 48,
              borderRadius: 14,
              border: '1px solid rgba(148,163,184,0.18)',
              background: 'rgba(2,6,23,0.72)',
              color: '#f8fafc',
              padding: '0 14px',
              outline: 'none',
              fontSize: 16,
              boxSizing: 'border-box',
            }}
          />
        </div>

        {error ? (
          <div
            style={{
              marginTop: 12,
              borderRadius: 14,
              padding: '10px 12px',
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.22)',
              color: '#fca5a5',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <button
            onClick={onSubmit}
            style={{
              flex: '1 1 180px',
              height: 46,
              borderRadius: 14,
              border: '1px solid rgba(34,197,94,0.24)',
              background: 'rgba(6,95,70,0.9)',
              color: '#ecfdf5',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Enter admin panel
          </button>

          <button
            onClick={onClose}
            style={{
              flex: '1 1 120px',
              height: 46,
              borderRadius: 14,
              border: '1px solid rgba(148,163,184,0.18)',
              background: 'rgba(15,23,42,0.8)',
              color: '#e2e8f0',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
