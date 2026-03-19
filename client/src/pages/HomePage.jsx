import React from 'react'
import { Link } from 'react-router-dom'
import { Activity, Factory, Lock } from 'lucide-react'

export default function HomePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, #0a3158 0%, #04172d 45%, #02101f 100%)',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      <Link
        to="/login"
        style={{
          position: 'absolute',
          top: '24px',
          left: '24px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          borderRadius: '14px',
          background: 'rgba(16, 30, 54, 0.9)',
          border: '1px solid rgba(90, 130, 170, 0.35)',
          color: '#ffffff',
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: '14px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
        }}
      >
        <Lock size={16} />
        Login
      </Link>

      <div
        style={{
          width: '100%',
          maxWidth: '980px',
        }}
      >
        <div
          style={{
            background: 'rgba(5, 18, 36, 0.82)',
            border: '1px solid rgba(67, 110, 150, 0.28)',
            borderRadius: '26px',
            padding: '30px',
            boxShadow: '0 25px 70px rgba(0,0,0,0.35)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '18px',
              marginBottom: '20px',
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '18px',
                background: 'rgba(34, 211, 238, 0.12)',
                border: '1px solid rgba(34, 211, 238, 0.22)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Factory size={30} color="#67e8f9" />
            </div>

            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 'clamp(34px, 5vw, 64px)',
                  lineHeight: 1.02,
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                }}
              >
                Farmplast Monitoring System
              </h1>
             
            </div>
          </div>

          <div
            style={{
              height: '1px',
              background: 'rgba(148, 163, 184, 0.16)',
              margin: '24px 0 28px 0',
            }}
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '18px',
            }}
          >
            <MonitorCard
              to="/monitoring/nj"
              title="Monitoring NJ"
              description="Open New Jersey chiller monitoring page"
            />

            <MonitorCard
              to="/monitoring/pa"
              title="Monitoring PA"
              description="Open Pennsylvania chiller monitoring page"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function MonitorCard({ to, title, description }) {
  return (
    <Link
      to={to}
      style={{
        textDecoration: 'none',
        color: '#ffffff',
        display: 'block',
      }}
    >
      <div
        style={{
          background: 'rgba(6, 48, 74, 0.42)',
          border: '1px solid rgba(34, 211, 238, 0.22)',
          borderRadius: '22px',
          padding: '24px',
          minHeight: '190px',
          boxSizing: 'border-box',
          cursor: 'pointer',
          transition: 'transform 0.18s ease, border-color 0.18s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-4px)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.34)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.22)'
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '18px',
          }}
        >
          <Activity size={28} color="#35d7ff" />
        </div>

        <h2
          style={{
            margin: 0,
            fontSize: '28px',
            lineHeight: 1.1,
            fontWeight: 800,
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h2>

        <p
          style={{
            margin: '12px 0 0 0',
            color: 'rgba(226, 232, 240, 0.78)',
            fontSize: '15px',
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      </div>
    </Link>
  )
}
