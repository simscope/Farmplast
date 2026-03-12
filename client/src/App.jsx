import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import DeviceMonitoringPage from './pages/DeviceMonitoringPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DeviceMonitoringPage />} />
        <Route path="/monitoring" element={<DeviceMonitoringPage />} />
      </Routes>
    </BrowserRouter>
  )
}
