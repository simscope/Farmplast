import React, { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'

import ProtectedRoute from './components/ProtectedRoute'

const HomePage = lazy(() => import('./pages/HomePage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const MonitoringPage = lazy(() => import('./pages/MonitoringPage'))
const MonitoringNJPage = lazy(() => import('./pages/MonitoringNJPage'))
const MonitoringPAPage = lazy(() => import('./pages/MonitoringPAPage'))
const EmployeesPage = lazy(() => import('./pages/EmployeesPage'))
const EmployeeDetailsPage = lazy(() => import('./pages/EmployeeDetailsPage'))
const EmployeePayStubPage = lazy(() => import('./pages/EmployeePayStubPage'))
const Chiller1HMIPage = lazy(() => import('./pages/Chiller1HMIPage'))
const Chiller2HMIPage = lazy(() => import('./pages/Chiller2HMIPage'))
const Chiller3HMIPage = lazy(() => import('./pages/Chiller3HMIPage'))
const BackupPage = lazy(() => import('./pages/BackupPage'))

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#020817] px-4 text-sm font-semibold text-slate-300">
      Loading...
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route path="/monitoring" element={<MonitoringPage />} />
          <Route path="/monitoring/nj" element={<MonitoringNJPage />} />
          <Route path="/monitoring/pa" element={<MonitoringPAPage />} />

          <Route
            path="/monitoring/nj/chiller-1"
            element={<Chiller1HMIPage />}
          />

          <Route
            path="/monitoring/nj/chiller-2"
            element={<Chiller2HMIPage />}
          />

          <Route
            path="/monitoring/nj/chiller-3"
            element={<Chiller3HMIPage />}
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/backup"
            element={
              <ProtectedRoute roles={['admin']}>
                <BackupPage />
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
            path="/employees/:employeeId/paystub"
            element={
              <ProtectedRoute>
                <EmployeePayStubPage />
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
      </Suspense>
    </AuthProvider>
  )
}
