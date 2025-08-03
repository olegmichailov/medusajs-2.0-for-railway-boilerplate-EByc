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

export const StripeContext = createContext(false)

const stripeKey = process.env.NEXT_PUBLIC_STRIPE_KEY
const stripePromise = stripeKey ? loadStripe(stripeKey) : null

const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID

const Wrapper: React.FC<WrapperProps> = ({ cart, children }) => {
  // Находим Stripe сессию, если есть
  const paymentSession =
    cart.payment_collection?.payment_sessions?.find(
      (s) => s.status === "pending" && isStripe(s.provider_id)
    ) ?? null

  // Показываем Stripe, только если сессия есть и есть client_secret!
  if (
    paymentSession &&
    isStripe(paymentSession.provider_id) &&
    stripePromise &&
    paymentSession.data?.client_secret
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

  // Показываем PayPal, если это paypal session и client id задан
  const paypalSession =
    cart.payment_collection?.payment_sessions?.find(
      (s) => s.status === "pending" && isPaypal(s.provider_id)
    ) ?? null

  if (
    paypalSession &&
    paypalClientId &&
    cart?.currency_code
  ) {
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

  // В остальных случаях — просто children (например, при оплате Gift Card или если сессии нет)
  return <div>{children}</div>
}

export default Wrapper
