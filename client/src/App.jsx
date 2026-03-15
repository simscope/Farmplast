import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import MonitoringPage from './pages/MonitoringPage'
import AdminPage from './pages/AdminPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>

        <Route path="/" element={<HomePage />} />

        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute roles={['owner','admin']}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/monitoring/:location"
          element={
            <ProtectedRoute roles={['owner','admin']}>
              <MonitoringPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['owner','admin']}>
              <AdminPage />
            </ProtectedRoute>
          }
        />

      </Routes>
    </AuthProvider>
  )
}
