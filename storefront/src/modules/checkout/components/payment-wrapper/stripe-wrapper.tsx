"use client"

import { Stripe, StripeElementsOptions } from "@stripe/stripe-js"
import { Elements } from "@stripe/react-stripe-js"
import { HttpTypes } from "@medusajs/types"

type StripeWrapperProps = {
  paymentSession: HttpTypes.StorePaymentSession
  stripeKey?: string
  stripePromise: Promise<Stripe | null> | null
  children: React.ReactNode
}

const StripeWrapper: React.FC<StripeWrapperProps> = ({
  paymentSession,
  stripeKey,
  stripePromise,
  children,
}) => {
  const options: StripeElementsOptions = {
    clientSecret: paymentSession.data?.client_secret,
  }

  if (!stripeKey) {
    throw new Error("Missing NEXT_PUBLIC_STRIPE_KEY")
  }

  if (!stripePromise) {
    throw new Error("Stripe not initialized")
  }

  if (!paymentSession?.data?.client_secret) {
    throw new Error("No client_secret provided by Medusa")
  }

  return (
    <Elements options={options} stripe={stripePromise}>
      {children}
    </Elements>
  )
}

export default StripeWrapper
