"use client"

import { Stripe, StripeElementsOptions } from "@stripe/stripe-js"
import { Elements } from "@stripe/react-stripe-js"
import { HttpTypes } from "@medusajs/types"
import React from "react"

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
  const clientSecret = paymentSession?.data?.client_secret as string | undefined

  // Если нет ключа/промиса/секрета — НЕ кидаем throw, просто рендерим детей без Elements.
  if (!stripeKey || !stripePromise || !clientSecret) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[StripeWrapper] Missing data:",
        { hasKey: !!stripeKey, hasPromise: !!stripePromise, hasClientSecret: !!clientSecret }
      )
    }
    return <>{children}</>
  }

  const options: StripeElementsOptions = { clientSecret }

  return (
    <Elements options={options} stripe={stripePromise}>
      {children}
    </Elements>
  )
}

export default StripeWrapper
