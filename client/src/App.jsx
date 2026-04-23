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
import EmployeesPage from './pages/EmployeesPage'
import EmployeeDetailsPage from './pages/EmployeeDetailsPage'
import Chiller1HMIPage from './pages/Chiller1HMIPage'
import Chiller2HMIPage from './pages/Chiller2HMIPage'
import Chiller3HMIPage from './pages/Chiller3HMIPage'
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />

        <Route path="/monitoring" element={<MonitoringPage />} />
        <Route path="/monitoring/nj" element={<MonitoringNJPage />} />
        <Route path="/monitoring/pa" element={<MonitoringPAPage />} />
        <Route path="/monitoring/nj/chiller-1" element={<Chiller1HMIPage />} />
        <Route path="/monitoring/nj/chiller-2" element={<Chiller2HMIPage />} />
        <Route path="/monitoring/nj/chiller-3" element={<Chiller3HMIPage />} />
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
          path="/employees"
          element={
            <ProtectedRoute roles={['admin']}>
              <EmployeesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/employees/:id"
          element={
            <ProtectedRoute>
              <EmployeeDetailsPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
