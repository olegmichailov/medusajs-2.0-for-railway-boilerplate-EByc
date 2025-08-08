"use client"

import React, { useEffect } from "react"
import { Elements } from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"

const stripeKey = process.env.NEXT_PUBLIC_STRIPE_KEY
const stripePromise = stripeKey ? loadStripe(stripeKey) : null

export default function CartLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Должно появиться в консоли при открытии /cart
    console.log("[cart/layout] mounted, stripeKey:", !!stripeKey)
  }, [])

  if (!stripePromise) return <>{children}</>
  return <Elements stripe={stripePromise}>{children}</Elements>
}
