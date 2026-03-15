import React, { useState } from 'react'
import LocationSelector from '../components/monitoring/LocationSelector'
import AdminLoginModal from '../components/monitoring/AdminLoginModal'

const ADMIN_PASSWORD = '1234'

function useViewport() {
  const getWidth = () => (typeof window !== 'undefined' ? window.innerWidth : 1440)
  const [width, setWidth] = React.useState(getWidth)

  React.useEffect(() => {
    function onResize() {
      setWidth(getWidth())
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return {
    isMobile: width < 768,
  }
}

export default function HomePage() {
  const { isMobile } = useViewport()
  const [adminModalOpen, setAdminModalOpen] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [adminError, setAdminError] = useState('')

  function handleAdminLogin() {
    if (adminPassword === ADMIN_PASSWORD) {
      setAdminError('')
      setAdminPassword('')
      setAdminModalOpen(false)
      window.location.href = '/admin'
      return
    }
    setAdminError('Wrong password')
  }

  return (
    <>
      <LocationSelector
        isMobile={isMobile}
        onAdminOpen={() => {
          setAdminModalOpen(true)
          setAdminError('')
        }}
      />

      <AdminLoginModal
        open={adminModalOpen}
        password={adminPassword}
        setPassword={setAdminPassword}
        error={adminError}
        onClose={() => {
          setAdminModalOpen(false)
          setAdminPassword('')
          setAdminError('')
        }}
        onSubmit={handleAdminLogin}
        isMobile={isMobile}
      />
    </>
  )
}
