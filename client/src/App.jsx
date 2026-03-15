import React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import MonitoringPage from './pages/MonitoringPage'
import MonitoringNJPage from './pages/MonitoringNJPage'
import MonitoringPAPage from './pages/MonitoringPAPage'
import AdminPage from './pages/AdminPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/monitoring" element={<MonitoringPage />} />
        <Route path="/monitoring/nj" element={<MonitoringNJPage />} />
        <Route path="/monitoring/pa" element={<MonitoringPAPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
