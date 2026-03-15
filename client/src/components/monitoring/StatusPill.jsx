import React from 'react'
import { Wifi, WifiOff } from 'lucide-react'

export default function StatusPill({ online }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: 999,
        padding: '8px 14px',
        background: online ? 'rgba(34,197,94,0.16)' : 'rgba(239,68,68,0.16)',
        color: online ? '#4ade80' : '#f87171',
        fontWeight: 800,
        fontSize: 12,
        letterSpacing: 0.6,
        whiteSpace: 'nowrap',
      }}
    >
      {online ? <Wifi size={14} /> : <WifiOff size={14} />}
      {online ? 'ONLINE' : 'OFFLINE'}
    </div>
  )
}
