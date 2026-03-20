import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'

import ProtectedRoute from './components/ProtectedRoute'

import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import MonitoringPage from './pages/MonitoringPage'
import MonitoringNJPage from './pages/MonitoringNJPage'
import MonitoringPAPage from './pages/MonitoringPAPage'
import AdminPage from './pages/AdminPage'
import AccountingPage from './pages/AccountingPage'
import EmployeesPage from './pages/EmployeesPage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />

        <Route path="/monitoring" element={<MonitoringPage />} />
        <Route path="/monitoring/nj" element={<MonitoringNJPage />} />
        <Route path="/monitoring/pa" element={<MonitoringPAPage />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['admin']}>
              <AdminPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/accounting"
          element={
            <ProtectedRoute roles={['admin', 'accountant']}>
              <AccountingPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/employees"
          element={
            <ProtectedRoute roles={['admin']}>
              <EmployeesPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
