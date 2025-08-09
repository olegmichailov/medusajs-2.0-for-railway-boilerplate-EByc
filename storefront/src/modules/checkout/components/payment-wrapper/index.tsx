"use client"

import { loadStripe } from "@stripe/stripe-js"
import React, { createContext } from "react"
import StripeWrapper from "./stripe-wrapper"
import { PayPalScriptProvider } from "@paypal/react-paypal-js"
import { HttpTypes } from "@medusajs/types"
import { isPaypal, isStripe } from "@lib/constants"

type WrapperProps = {
  cart: HttpTypes.StoreCart
  children: React.ReactNode
}

/** Сообщаем дочерним, что мы внутри Stripe Elements на checkout */
export const StripeContext = createContext(false)

const stripeKey = process.env.NEXT_PUBLIC_STRIPE_KEY
const stripePromise = stripeKey ? loadStripe(stripeKey) : null

const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID

const Wrapper: React.FC<WrapperProps> = ({ cart, children }) => {
  const sessions = cart.payment_collection?.payment_sessions ?? []

  // Ищем stripe-сессию с client_secret (главное для Elements)
  const stripeSession = sessions.find(
    (s) => isStripe(s.provider_id) && s?.data?.client_secret
  )

  if (stripeSession && stripePromise) {
    return (
      <StripeContext.Provider value={true}>
        <StripeWrapper
          paymentSession={stripeSession}
          stripeKey={stripeKey}
          stripePromise={stripePromise}
        >
          {children}
        </StripeWrapper>
      </StripeContext.Provider>
    )
  }

  // PayPal (если используется)
  const paypalSession = sessions.find((s) => isPaypal(s.provider_id))
  if (paypalSession && paypalClientId && cart) {
    return (
      <PayPalScriptProvider
        options={{
          "client-id": paypalClientId,
          currency: cart.currency_code.toUpperCase(),
          intent: "authorize",
          components: "buttons",
        }}
      >
        {children}
      </PayPalScriptProvider>
    )
  }

  return <div>{children}</div>
}

export default Wrapper
