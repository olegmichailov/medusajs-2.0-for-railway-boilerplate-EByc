// storefront/src/modules/checkout/components/payment-wrapper/index.tsx
"use client"

import { loadStripe } from "@stripe/stripe-js"
import React from "react"
import StripeWrapper from "./stripe-wrapper"
import { PayPalScriptProvider } from "@paypal/react-paypal-js"
import { HttpTypes } from "@medusajs/types"
import { isPaypal, isStripe } from "@lib/constants"

// Сообщаем дочерним, что мы внутри Stripe Elements на checkout
export const StripeContext = React.createContext(false)

type WrapperProps = {
  cart: HttpTypes.StoreCart
  children: React.ReactNode
}

const stripeKey = process.env.NEXT_PUBLIC_STRIPE_KEY
const stripePromise = stripeKey ? loadStripe(stripeKey) : null

const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID

const Wrapper: React.FC<WrapperProps> = ({ cart, children }) => {
  const sessions = cart.payment_collection?.payment_sessions ?? []

  // Stripe-сессия с client_secret — это то, что нужно Elements
  const stripeSession = sessions.find(
    (s) => isStripe(s.provider_id) && (s?.data as any)?.client_secret
  )

  if (stripeSession && stripePromise) {
    // ВАЖНО: теперь StripeContext.Provider находится внутри StripeWrapper,
    // и включается только когда Elements смонтирован.
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

  // PayPal через «родной» SDK — только если ты используешь PayPal НЕ через Stripe.
  // Если ты используешь PayPal внутри Stripe PaymentElement — этот блок не нужен,
  // но он и не сработает без NEXT_PUBLIC_PAYPAL_CLIENT_ID.
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

  // Ничего не готово — отрисовываем как есть
  return <>{children}</>
}

export default Wrapper
export { StripeContext }
