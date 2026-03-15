import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import MonitoringPage from './pages/MonitoringPage'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <MonitoringPage />
  </BrowserRouter>
)
