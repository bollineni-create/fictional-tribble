import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

/**
 * Customer Portal Button — lets users manage their subscription
 *
 * Opens Stripe's self-service customer portal where users can:
 * - Update payment methods
 * - View/download invoices
 * - Cancel or change their subscription
 * - Update billing info
 *
 * Requires: /api/create-portal-session Netlify function
 */

interface CustomerPortalButtonProps {
  label?: string
  className?: string
  style?: React.CSSProperties
}

export default function CustomerPortalButton({
  label = 'Manage Subscription',
  className = '',
  style,
}: CustomerPortalButtonProps) {
  const { session } = useAuth()
  const [loading, setLoading] = useState(false)

  const openPortal = async () => {
    if (!session?.access_token) return
    setLoading(true)
    try {
      const res = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to open portal')
      window.location.href = data.url
    } catch (err: any) {
      alert('Could not open billing portal: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={openPortal}
      disabled={loading}
      className={className}
      style={style}
    >
      {loading ? 'Opening...' : label}
    </button>
  )
}
