"use client"

import { Stripe, StripeElementsOptions } from "@stripe/stripe-js"
import { Elements } from "@stripe/react-stripe-js"
import { HttpTypes } from "@medusajs/types"

type StripeWrapperProps = {
  paymentSession: HttpTypes.StorePaymentSession
  stripePromise: Promise<Stripe | null>
  children: React.ReactNode
}

const StripeWrapper: React.FC<StripeWrapperProps> = ({
  paymentSession,
  stripePromise,
  children,
}) => {
  if (!paymentSession?.data?.client_secret) {
    throw new Error("Stripe client secret is missing.")
  }

  const options: StripeElementsOptions = {
    clientSecret: paymentSession.data.client_secret as string,
    appearance: {
      theme: 'stripe',
    },
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      {children}
    </Elements>
  )
}

export default StripeWrapper
