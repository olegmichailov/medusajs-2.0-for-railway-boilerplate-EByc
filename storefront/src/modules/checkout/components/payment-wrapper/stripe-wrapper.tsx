// storefront/src/modules/checkout/components/payment-wrapper/stripe-wrapper.tsx
"use client"

import React from "react"
import type { Stripe, StripeElementsOptions } from "@stripe/stripe-js"
import { Elements } from "@stripe/react-stripe-js"
import type { HttpTypes } from "@medusajs/types"
import { StripeContext } from "@/modules/checkout/components/payment-wrapper"

type Props = {
  paymentSession: HttpTypes.StorePaymentSession
  stripeKey?: string
  stripePromise: Promise<Stripe | null> | null
  children: React.ReactNode
}

/**
 * Безопасная обёртка для Stripe Elements.
 * ВАЖНО: контекст StripeContext = true только если Elements реально смонтирован.
 * Иначе — возвращаем детей как есть (контекст не задаём), чтобы UI не пытался звать useElements().
 */
const StripeWrapper: React.FC<Props> = ({
  paymentSession,
  stripeKey,
  stripePromise,
  children,
}) => {
  const clientSecret = (paymentSession?.data as any)?.client_secret as
    | string
    | undefined

  if (!stripeKey || !stripePromise || !clientSecret) {
    // Elements ещё нет — отдаём детей без провайдера (stripeReady=false)
    return <>{children}</>
  }

  const options: StripeElementsOptions = {
    clientSecret,
    locale: "en",
    appearance: { theme: "stripe" },
  }

  return (
    <StripeContext.Provider value={true}>
      {/* key реинициализирует Elements при смене client_secret */}
      <Elements key={clientSecret} options={options} stripe={stripePromise}>
        {children}
      </Elements>
    </StripeContext.Provider>
  )
}

export default StripeWrapper
