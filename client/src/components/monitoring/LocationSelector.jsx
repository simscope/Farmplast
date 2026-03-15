import React from 'react'
import { Factory, Lock, MapPin } from 'lucide-react'

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

export default function LocationSelector({ isMobile, onAdminOpen }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top, #0f766e 0%, #020617 45%, #01030a 100%)',
        color: '#f8fafc',
        padding: isMobile ? 14 : 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 1260 }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 20 : 28 }}>
          <div style={{ color: '#67e8f9', fontSize: 13, fontWeight: 900, letterSpacing: 1.2 }}>
            SIM SCOPE / FARMPLAST
          </div>
          <h1
            style={{
              margin: '8px 0 10px',
              fontSize: isMobile ? 32 : 'clamp(34px, 5vw, 64px)',
              lineHeight: 1.02,
            }}
          >
            Choose production location
          </h1>
          <div style={{ color: '#cbd5e1', fontSize: isMobile ? 14 : 16 }}>
            Open plant overview with live industrial telemetry
          </div>

          <div style={{ marginTop: 18 }}>
            <button
              onClick={onAdminOpen}
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
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: isMobile ? 14 : 18,
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
                borderRadius: 24,
                padding: isMobile ? 20 : 26,
                textAlign: 'left',
                cursor: loc.active ? 'pointer' : 'not-allowed',
                opacity: loc.active ? 1 : 0.55,
                minHeight: isMobile ? 220 : 260,
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
                <div style={{ fontSize: isMobile ? 28 : 34, fontWeight: 900, marginTop: 8 }}>
                  {loc.title}
                </div>
                <div style={{ fontSize: isMobile ? 15 : 16, color: '#dbeafe', marginTop: 8 }}>
                  {loc.subtitle}
                </div>
                <div style={{ fontSize: 14, color: '#cbd5e1', marginTop: 18, maxWidth: 400 }}>
                  {loc.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
