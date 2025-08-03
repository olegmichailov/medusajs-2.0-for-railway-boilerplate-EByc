"use client"
import React, { createContext, useEffect, useState, PropsWithChildren } from "react"
import { Elements, loadStripe, Appearance } from "@stripe/react-stripe-js"
import { StripeElementsOptions } from "@stripe/stripe-js"
import { useCart } from "@lib/context/cart"  // assuming a Cart context/hook provides `cart`
import { initiatePaymentSession } from "@lib/data/cart"

// Load Stripe with the publishable key from environment variables
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY || "")

// Context to indicate when Stripe Elements is ready (i.e., client secret is available)
export const StripeContext = createContext<boolean>(false)

const StripeWrapper: React.FC<PropsWithChildren> = ({ children }) => {
  const { cart } = useCart()  // get the current cart from context
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [stripeReady, setStripeReady] = useState<boolean>(false)

  // Effect to initiate Stripe Payment Session when cart is present and no payment session yet
  useEffect(() => {
    if (cart && !cart.payment_collection) {
      // If no payment session is initialized for the cart, create one for Stripe
      initiatePaymentSession(cart, { provider_id: "pp_stripe_stripe" }).catch((err) => {
        console.error("Failed to create Stripe payment session", err)
      })
    }
  }, [cart])

  // Effect to update clientSecret and readiness when the cart's Stripe session becomes available
  useEffect(() => {
    const stripeSession = cart?.payment_collection?.payment_sessions?.find(
      (session: any) => session.provider_id === "pp_stripe_stripe"
    )
    const secret = stripeSession?.data?.client_secret ?? null
    setClientSecret(secret)
    setStripeReady(!!secret)
  }, [cart])

  // Stripe Elements appearance options (you can customize this or leave empty)
  const appearance: Appearance = {}
  const elementsOptions: StripeElementsOptions = clientSecret 
    ? { clientSecret, appearance } 
    : {}

  return (
    <StripeContext.Provider value={stripeReady}>
      {clientSecret ? (
        <Elements stripe={stripePromise} options={elementsOptions}>
          {children}
        </Elements>
      ) : (
        // Render children without Elements while Stripe is not ready (to avoid Stripe Elements errors)
        children
      )}
    </StripeContext.Provider>
  )
}

export default StripeWrapper
