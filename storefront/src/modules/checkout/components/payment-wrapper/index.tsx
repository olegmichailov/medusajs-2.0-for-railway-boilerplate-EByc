"use client"

import React, { createContext } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements } from "@stripe/react-stripe-js"
import { PayPalScriptProvider } from "@paypal/react-paypal-js"
import { isStripe, isPaypal } from "@lib/constants"

export const StripeContext = createContext(false)
const stripeKey = process.env.NEXT_PUBLIC_STRIPE_KEY
const stripePromise = loadStripe(stripeKey!)

const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID

const Wrapper = ({ cart, children }: { cart: any; children: React.ReactNode }) => {
  const paymentSession = cart.payment_collection?.payment_sessions.find((s: any) => s.status === "pending")

  if (isStripe(paymentSession?.provider_id)) {
    return (
      <StripeContext.Provider value={true}>
        <Elements options={{ clientSecret: paymentSession.data.client_secret }} stripe={stripePromise}>
          {children}
        </Elements>
      </StripeContext.Provider>
    )
  }

  if (isPaypal(paymentSession?.provider_id)) {
    return (
      <PayPalScriptProvider options={{ "client-id": paypalClientId, currency: cart.currency_code.toUpperCase(), intent: "authorize" }}>
        {children}
      </PayPalScriptProvider>
    )
  }

  return <>{children}</>
}

export default Wrapper
