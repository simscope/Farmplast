import React, { useState } from 'react'
import { Factory, Lock, MapPin, X } from 'lucide-react'

const ADMIN_PASSWORD = '1234'

const LOCATIONS = [
  {
    code: 'PA',
    title: 'Pennsylvania',
    subtitle: 'Production monitoring',
    description: 'Open plant overview and equipment status',
    active: true,
    route: '/monitoring/pa',
    gradient: 'linear-gradient(135deg, #1f2937 0%, #0f172a 100%)',
  },
  {
    code: 'NJ',
    title: 'New Jersey',
    subtitle: 'Farmplast production',
    description: 'Chillers, barrel level and live telemetry',
    active: true,
    route: '/monitoring/nj',
    gradient: 'linear-gradient(135deg, #0f766e 0%, #0f172a 100%)',
  },
]

function AdminLoginModal({
  open,
  password,
  setPassword,
  error,
  onClose,
  onSubmit,
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
        padding: 20,
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
          padding: 22,
          boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
          color: '#f8fafc',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>
              SECURE ACCESS
            </div>
            <div style={{ marginTop: 6, fontSize: 26, fontWeight: 900 }}>
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

export default function HomePage() {
  const [adminModalOpen, setAdminModalOpen] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [adminError, setAdminError] = useState('')

  function handleAdminLogin() {
    if (adminPassword === ADMIN_PASSWORD) {
      setAdminError('')
      setAdminPassword('')
      setAdminModalOpen(false)
      window.location.href = '/admin'
      return
    }
    setAdminError('Wrong password')
  }

  return (
    <>
      <div
        style={{
          minHeight: '100vh',
          background: 'radial-gradient(circle at top, #0f766e 0%, #020617 45%, #01030a 100%)',
          color: '#f8fafc',
          padding: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: 1260 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ color: '#67e8f9', fontSize: 13, fontWeight: 900, letterSpacing: 1.2 }}>
              SIM SCOPE / FARMPLAST
            </div>
            <h1 style={{ margin: '8px 0 10px', fontSize: 'clamp(34px, 5vw, 64px)', lineHeight: 1.02 }}>
              Choose production location
            </h1>
            <div style={{ color: '#cbd5e1', fontSize: 16 }}>
              Open plant overview with live industrial telemetry
            </div>

            <div style={{ marginTop: 18 }}>
              <button
                onClick={() => {
                  setAdminModalOpen(true)
                  setAdminError('')
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  height: 46,
                  padding: '0 16px',
                  borderRadius: 14,
                  border: '1px solid rgba(103,232,249,0.22)',
                  background: 'rgba(8,47,73,0.72)',
                  color: '#ecfeff',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                <Lock size={16} />
                Admin Login
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 18,
            }}
          >
            {LOCATIONS.map((loc) => (
              <button
                key={loc.code}
                onClick={() => loc.active && (window.location.href = loc.route)}
                style={{
                  border: loc.active
                    ? '1px solid rgba(103,232,249,0.28)'
                    : '1px solid rgba(148,163,184,0.14)',
                  background: loc.gradient,
                  color: '#fff',
                  borderRadius: 30,
                  padding: 26,
                  textAlign: 'left',
                  cursor: loc.active ? 'pointer' : 'not-allowed',
                  opacity: loc.active ? 1 : 0.55,
                  minHeight: 260,
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
                }}
              >
                <div style={{ position: 'absolute', right: -20, top: -20, opacity: 0.08 }}>
                  <Factory size={180} strokeWidth={1.2} />
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  <div
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: 18,
                      display: 'grid',
                      placeItems: 'center',
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.14)',
                    }}
                  >
                    <MapPin size={28} />
                  </div>
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: 999,
                      background: loc.active ? 'rgba(34,197,94,0.16)' : 'rgba(148,163,184,0.16)',
                      color: loc.active ? '#4ade80' : '#cbd5e1',
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {loc.active ? 'AVAILABLE' : 'COMING SOON'}
                  </div>
                </div>

                <div style={{ position: 'relative', zIndex: 1, marginTop: 22 }}>
                  <div style={{ color: '#67e8f9', fontWeight: 900, fontSize: 13, letterSpacing: 1 }}>
                    {loc.code}
                  </div>
                  <div style={{ fontSize: 34, fontWeight: 900, marginTop: 8 }}>{loc.title}</div>
                  <div style={{ fontSize: 16, color: '#dbeafe', marginTop: 8 }}>{loc.subtitle}</div>
                  <div style={{ fontSize: 14, color: '#cbd5e1', marginTop: 18, maxWidth: 400 }}>
                    {loc.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <AdminLoginModal
        open={adminModalOpen}
        password={adminPassword}
        setPassword={setAdminPassword}
        error={adminError}
        onClose={() => {
          setAdminModalOpen(false)
          setAdminPassword('')
          setAdminError('')
        }}
        onSubmit={handleAdminLogin}
      />
    </>
  )
}
