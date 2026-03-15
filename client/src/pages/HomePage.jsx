import React from 'react'
import { Link } from 'react-router-dom'
import { Activity, Lock, Factory } from 'lucide-react'

export default function HomePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'linear-gradient(180deg, #031326 0%, #051a33 45%, #07213f 100%)',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1100px',
        }}
      >
        <div
          style={{
            background: 'rgba(8, 20, 38, 0.88)',
            border: '1px solid rgba(70, 130, 180, 0.28)',
            borderRadius: '24px',
            padding: '32px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.35)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginBottom: '18px',
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
                  fontSize: 'clamp(30px, 5vw, 52px)',
                  lineHeight: 1.05,
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                }}
              >
                Farmplast Monitoring System
              </h1>

              <p
                style={{
                  margin: '10px 0 0 0',
                  color: 'rgba(226, 232, 240, 0.78)',
                  fontSize: '16px',
                  lineHeight: 1.5,
                  maxWidth: '760px',
                }}
              >
                Public monitoring access for chillers. Login is only for internal
                sections such as accounting and administration.
              </p>
            </div>
          </div>

          <div
            style={{
              height: '1px',
              background: 'rgba(148, 163, 184, 0.18)',
              margin: '24px 0 28px 0',
            }}
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '18px',
            }}
          >
            <HomeCard
              to="/monitoring/nj"
              title="Monitoring NJ"
              description="Open New Jersey chiller monitoring page"
              icon={<Activity size={28} color="#22d3ee" />}
              bg="rgba(8, 145, 178, 0.14)"
              border="rgba(34, 211, 238, 0.24)"
            />

            <HomeCard
              to="/monitoring/pa"
              title="Monitoring PA"
              description="Open Pennsylvania chiller monitoring page"
              icon={<Activity size={28} color="#38bdf8" />}
              bg="rgba(14, 116, 144, 0.14)"
              border="rgba(56, 189, 248, 0.24)"
            />

            <HomeCard
              to="/login"
              title="Login"
              description="Access accounting and internal admin pages"
              icon={<Lock size={28} color="#f8fafc" />}
              bg="rgba(51, 65, 85, 0.55)"
              border="rgba(148, 163, 184, 0.24)"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function HomeCard({ to, title, description, icon, bg, border }) {
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
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: '22px',
          padding: '22px',
          minHeight: '190px',
          boxSizing: 'border-box',
          transition: 'transform 0.18s ease, border-color 0.18s ease',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-4px)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.34)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.borderColor = border
        }}
      >
        <div
          style={{
            width: '58px',
            height: '58px',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '18px',
          }}
        >
          {icon}
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
