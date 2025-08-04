'use client'

import React, { useEffect, useState } from 'react'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe, StripeElementsOptions } from '@stripe/stripe-js'
import { useCart } from 'medusa-react'

import Spinner from '@modules/common/icons/spinner'
import Payment from './Payment'

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string
)

type StripeWrapperProps = {
  cartId: string
  region: string
}

const StripeWrapper: React.FC<StripeWrapperProps> = ({ cartId, region }) => {
  const { cart } = useCart()
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  useEffect(() => {
    const initPayment = async () => {
      if (!cart?.id) return

      const response = await fetch('/api/stripe/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart_id: cart.id }),
      })

      const data = await response.json()
      setClientSecret(data.client_secret)
    }

    initPayment()
  }, [cart?.id])

  if (!stripePromise || !clientSecret) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  const options: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: 'flat',
      labels: 'floating',
    },
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <Payment />
    </Elements>
  )
}

export default StripeWrapper
