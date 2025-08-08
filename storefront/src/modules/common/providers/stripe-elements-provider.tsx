"use client"

import React from "react"
import { Elements } from "@stripe/react-stripe-js"
import { loadStripe, Stripe } from "@stripe/stripe-js"

const stripeKey = process.env.NEXT_PUBLIC_STRIPE_KEY
const stripePromise: Promise<Stripe | null> | null = stripeKey ? loadStripe(stripeKey) : null

/**
 * Глобальный провайдер Stripe Elements без client_secret.
 * Ничего не ломает, но гарантирует, что useStripe()/useElements() всегда в контексте.
 * На /checkout внутри будет второй <Elements options={{ clientSecret }}> — это нормально.
 */
export default function StripeElementsProvider({ children }: { children: React.ReactNode }) {
  if (!stripePromise) return <>{children}</>
  return <Elements stripe={stripePromise}>{children}</Elements>
}
