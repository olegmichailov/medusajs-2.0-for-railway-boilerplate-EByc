"use client"

import React, { createContext } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { PayPalScriptProvider } from "@paypal/react-paypal-js"
import { HttpTypes } from "@medusajs/types"
import StripeWrapper from "./stripe-wrapper"
import { isPaypal, isStripe } from "@lib/constants"

type WrapperProps = {
  cart: HttpTypes.StoreCart
  children: React.ReactNode
}

/** Контекст-флажок: внутри Stripe Elements или нет */
export const StripeContext = createContext(false)

// Поддержим оба названия ключа, чтобы не промахнуться переменной
const stripeKey =
  process.env.NEXT_PUBLIC_STRIPE_KEY ||
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ||
  ""

const stripePromise = stripeKey ? loadStripe(stripeKey) : null

const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || ""

const Wrapper: React.FC<WrapperProps> = ({ cart, children }) => {
  const sessions = cart?.payment_collection?.payment_sessions ?? []

  // Ищем stripe-сессию с client_secret
  const stripeSession = sessions.find(
    (s) => isStripe(s.provider_id) && s?.data?.client_secret
  )

  if (stripeSession && stripePromise) {
    // ВАЖНО: сам StripeWrapper решает, когда контекст TRUE
    return (
      <StripeWrapper
        paymentSession={stripeSession}
        stripeKey={stripeKey}
        stripePromise={stripePromise}
      >
        {children}
      </StripeWrapper>
    )
  }

  // Вариант PayPal через SDK (если понадобится)
  const paypalSession = sessions.find((s) => isPaypal(s.provider_id))
  if (paypalSession && paypalClientId && cart) {
    return (
      <PayPalScriptProvider
        options={{
          "client-id": paypalClientId,
          currency: cart.currency_code?.toUpperCase?.() || "EUR",
          intent: "authorize",
          components: "buttons",
        }}
      >
        {children}
      </PayPalScriptProvider>
    )
  }

  // Ничего не готово — контекст FALSE
  return <StripeContext.Provider value={false}>{children}</StripeContext.Provider>
}

export default Wrapper
