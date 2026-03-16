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

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/monitoring"
          element={
            <ProtectedRoute>
              <MonitoringPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/monitoring/nj"
          element={
            <ProtectedRoute>
              <MonitoringNJPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/monitoring/pa"
          element={
            <ProtectedRoute>
              <MonitoringPAPage />
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
            <ProtectedRoute roles={['admin','accountant']}>
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
