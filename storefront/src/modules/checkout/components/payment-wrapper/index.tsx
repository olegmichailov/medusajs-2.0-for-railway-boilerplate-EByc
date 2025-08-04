"use client"

import React, { createContext } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { PayPalScriptProvider } from "@paypal/react-paypal-js"

import StripeWrapper from "./stripe-wrapper"
import { isPaypal, isStripe } from "@lib/constants"
import { HttpTypes } from "@medusajs/types"

type WrapperProps = {
  cart: HttpTypes.StoreCart
  children: React.ReactNode
}

export const StripeContext = createContext(false)

const stripeKey = process.env.NEXT_PUBLIC_STRIPE_KEY
const stripePromise = stripeKey ? loadStripe(stripeKey) : null
const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID

const Wrapper: React.FC<WrapperProps> = ({ cart, children }) => {
  const paymentSession = cart.payment_collection?.payment_sessions?.find(
    (s) => s.status === "pending"
  )

  if (
    isStripe(paymentSession?.provider_id) &&
    paymentSession &&
    stripePromise
  ) {
    return (
      <StripeContext.Provider value={true}>
        <StripeWrapper
          paymentSession={paymentSession}
          stripeKey={stripeKey}
          stripePromise={stripePromise}
        >
          {children}
        </StripeWrapper>
      </StripeContext.Provider>
    )
  }

  if (
    isPaypal(paymentSession?.provider_id) &&
    paypalClientId &&
    cart
  ) {
    return (
      <PayPalScriptProvider
        options={{
          "client-id": paypalClientId,
          currency: cart.currency_code?.toUpperCase(),
          intent: "authorize",
          components: "buttons",
        }}
      >
        {children}
      </PayPalScriptProvider>
    )
  }

  return <>{children}</>
}

export default Wrapper
