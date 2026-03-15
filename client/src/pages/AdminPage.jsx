import React from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function AdminPage() {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f172a',
        color: '#ffffff',
        padding: '40px',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <h1 style={{ marginTop: 0 }}>Admin Dashboard</h1>
      <p>Ты успешно залогинился. Страница admin работает.</p>

      <div
        style={{
          marginTop: '24px',
          padding: '20px',
          borderRadius: '16px',
          background: '#1e293b',
          border: '1px solid #334155',
          maxWidth: '600px',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Sim Scope Control Panel</h2>
        <p>Отсюда потом подключим:</p>
        <ul>
          <li>Monitoring NJ</li>
          <li>Monitoring PA</li>
          <li>Users / Roles</li>
          <li>Settings</li>
        </ul>

        <button
          onClick={handleLogout}
          style={{
            marginTop: '16px',
            padding: '10px 16px',
            borderRadius: '10px',
            border: 'none',
            background: '#2563eb',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Logout
        </button>
      </div>
    </div>
  )
}
