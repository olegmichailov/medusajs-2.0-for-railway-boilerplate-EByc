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

/**
 * Монтирует Stripe Elements с client_secret PaymentIntent'а.
 * Payment Element сам показывает доступные методы (Card, SEPA, Klarna, кошельки и т.д.)
 */
const StripeWrapper: React.FC<StripeWrapperProps> = ({
  paymentSession,
  stripeKey,
  stripePromise,
  children,
}) => {
  const clientSecret = paymentSession?.data?.client_secret as
    | string
    | undefined

  const options: StripeElementsOptions = {
    clientSecret,
    locale: "en", // при желании "de"
    appearance: { theme: "stripe" },
  }

  if (!stripeKey) {
    throw new Error(
      "Stripe key is missing. Set NEXT_PUBLIC_STRIPE_KEY environment variable."
    )
  }

  if (!stripePromise) {
    throw new Error(
      "Stripe promise is missing. Make sure you have provided a valid Stripe key."
    )
  }

  if (!clientSecret) {
    throw new Error(
      "Stripe client secret is missing. Cannot initialize Stripe."
    )
  }

  // key заставляет Elements переинициализироваться при новом client_secret
  return (
    <Elements key={clientSecret} options={options} stripe={stripePromise}>
      {children}
    </Elements>
  )
}

export default StripeWrapper
