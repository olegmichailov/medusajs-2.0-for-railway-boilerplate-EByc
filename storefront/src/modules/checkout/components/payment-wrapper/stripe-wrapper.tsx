"use client"

import { Elements } from "@stripe/react-stripe-js"
import type { Stripe, StripeElementsOptions } from "@stripe/stripe-js"
import type { HttpTypes } from "@medusajs/types"

type StripeWrapperProps = {
  paymentSession?: HttpTypes.StorePaymentSession
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
  if (!stripeKey || !stripePromise || !paymentSession?.data?.client_secret) {
    // Не рендерить ничего если нет нужных данных —> безопасно
    return null
  }

  const options: StripeElementsOptions = {
    clientSecret: paymentSession.data.client_secret as string,
    appearance: { theme: "stripe" },
  }

  return (
    <Elements options={options} stripe={stripePromise}>
      {children}
    </Elements>
  )
}

export default StripeWrapper
