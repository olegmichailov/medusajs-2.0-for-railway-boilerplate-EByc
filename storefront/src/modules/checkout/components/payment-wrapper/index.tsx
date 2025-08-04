"use client"

import { loadStripe } from "@stripe/stripe-js"
import React, {
  createContext,
  useEffect,
  useState,
  useCallback,
} from "react"
import StripeWrapper from "./stripe-wrapper"
import { PayPalScriptProvider } from "@paypal/react-paypal-js"
import { HttpTypes } from "@medusajs/types"
import { isPaypal, isStripe } from "@lib/constants"
import { sdk } from "@lib/config"

type WrapperProps = {
  cart: HttpTypes.StoreCart
  children: React.ReactNode
}

export const StripeContext = createContext(false)

const stripeKey = process.env.NEXT_PUBLIC_STRIPE_KEY
const stripePromise = stripeKey ? loadStripe(stripeKey) : null

const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID

const Wrapper: React.FC<WrapperProps> = ({ cart, children }) => {
  const [paymentSession, setPaymentSession] = useState<
    HttpTypes.StorePaymentSession | null
  >(null)

  const initializeStripeSession = useCallback(async () => {
    if (!cart?.id) return
    try {
      const updatedCart = await sdk.store.carts.createPaymentSessions(cart.id)
      const sessions =
        updatedCart?.cart?.payment_collection?.payment_sessions || []
      const stripeSession = sessions.find((s) => isStripe(s.provider_id))
      if (stripeSession) {
        setPaymentSession(stripeSession)
      }
    } catch (err) {
      console.error("Error initializing Stripe session", err)
    }
  }, [cart?.id])

  useEffect(() => {
    if (!paymentSession && isStripe(cart?.payment_session?.provider_id)) {
      initializeStripeSession()
    } else if (
      !paymentSession &&
      cart?.payment_collection?.payment_sessions?.length
    ) {
      const session = cart.payment_collection.payment_sessions.find((s) =>
        isStripe(s.provider_id)
      )
      if (session) {
        setPaymentSession(session)
      }
    }
  }, [cart, initializeStripeSession, paymentSession])

  if (
    isStripe(paymentSession?.provider_id) &&
    paymentSession?.data?.client_secret &&
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
    isPaypal(cart?.payment_session?.provider_id) &&
    paypalClientId !== undefined &&
    cart
  ) {
    return (
      <PayPalScriptProvider
        options={{
          "client-id": paypalClientId,
          currency: cart?.currency_code?.toUpperCase() || "USD",
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
