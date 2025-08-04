// src/modules/checkout/components/payment-wrapper/Payment.tsx

import React, { useEffect, useState } from 'react'
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'

interface PaymentProps {
  onPaymentSuccess: () => void
}

const Payment: React.FC<PaymentProps> = ({ onPaymentSuccess }) => {
  const stripe = useStripe()
  const elements = useElements()

  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setLoading(true)
    setErrorMessage(null)

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/thank-you`,
      },
      redirect: 'if_required',
    })

    if (result.error) {
      setErrorMessage(result.error.message || 'Payment failed')
    } else {
      onPaymentSuccess()
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement id="payment-element" options={{ layout: 'tabs' }} />
      {errorMessage && <div className="text-red-500 text-sm">{errorMessage}</div>}
      <Button type="submit" disabled={!stripe || loading}>
        {loading ? 'Processing...' : 'Pay now'}
      </Button>
    </form>
  )
}

export default Payment
