"use client"

import React from "react"
import { Elements } from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"

// Подтягиваем publishable key
const stripeKey = process.env.NEXT_PUBLIC_STRIPE_KEY
const stripePromise = stripeKey ? loadStripe(stripeKey) : null

export default function CartLayout({ children }: { children: React.ReactNode }) {
  // На /cart нам не нужен client_secret — нам нужен только контекст,
  // чтобы любые случайные useStripe() не роняли страницу.
  if (!stripePromise) return <>{children}</>

  return <Elements stripe={stripePromise}>{children}</Elements>
}
