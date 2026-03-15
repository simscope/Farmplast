import React from 'react'
import { useParams } from 'react-router-dom'

export default function MonitoringPage() {
  const { location } = useParams()

  const site = location || 'nj'

  return (
    <div style={{ padding: '40px', color: 'white' }}>
      <h1>Monitoring {site.toUpperCase()}</h1>
    </div>
  )
}
