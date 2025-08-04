"use client"

import React, { createContext, useEffect, useState } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements } from "@stripe/react-stripe-js"

interface StripeWrapperProps {
  children: React.ReactNode
  clientSecret?: string
}

export const StripeContext = createContext(false)

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "")

const StripeWrapper: React.FC<StripeWrapperProps> = ({ children, clientSecret }) => {
  const [stripeReady, setStripeReady] = useState(false)
  const [options, setOptions] = useState<any>(null)

  useEffect(() => {
    if (!clientSecret) return

    setOptions({
      clientSecret,
      appearance: {
        theme: "flat",
      },
    })

    setStripeReady(true)
  }, [clientSecret])

  if (!clientSecret || !options) {
    return <>{children}</>
  }

  return (
    <StripeContext.Provider value={stripeReady}>
      <Elements stripe={stripePromise} options={options}>
        {children}
      </Elements>
    </StripeContext.Provider>
  )
}

export default StripeWrapper
