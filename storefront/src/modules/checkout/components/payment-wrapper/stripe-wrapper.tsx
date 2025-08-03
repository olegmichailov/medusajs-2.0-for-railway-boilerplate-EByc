"use client"

import { Stripe, StripeElementsOptions } from "@stripe/stripe-js"
import { Elements } from "@stripe/react-stripe-js"
import { HttpTypes } from "@medusajs/types"

type StripeWrapperProps = {
  paymentSession: HttpTypes.StorePaymentSession | undefined
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
  // --- Добавь эти проверки! ---
  if (!paymentSession || !paymentSession.data || !paymentSession.data.client_secret) {
    // Можно рендерить плейсхолдер или null, а не падать с ошибкой!
    return <div>Не удалось инициализировать оплату Stripe. Попробуйте позже.</div>
  }

  const options: StripeElementsOptions = {
    clientSecret: paymentSession.data.client_secret as string,
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

  return (
    <Elements options={options} stripe={stripePromise}>
      {children}
    </Elements>
  )
}

export default StripeWrapper
