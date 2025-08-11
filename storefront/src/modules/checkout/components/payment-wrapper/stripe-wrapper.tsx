"use client"

import { Elements } from "@stripe/react-stripe-js"
import type { Stripe, StripeElementsOptions } from "@stripe/stripe-js"
import { HttpTypes } from "@medusajs/types"
import React from "react"
import { StripeContext } from "@" /* путь alias ниже в index.tsx, см. импорт */ + "modules/checkout/components/payment-wrapper"

type Props = {
  paymentSession: HttpTypes.StorePaymentSession
  stripeKey?: string
  stripePromise: Promise<Stripe | null> | null
  children: React.ReactNode
}

/**
 * Обёртка, которая:
 * - НЕ кидает исключений, если данных мало
 * - отдаёт StripeContext=false, пока Elements НЕ смонтирован
 * - включает StripeContext=true ТОЛЬКО внутри <Elements>
 */
const StripeWrapper: React.FC<Props> = ({
  paymentSession,
  stripeKey,
  stripePromise,
  children,
}) => {
  const clientSecret =
    (paymentSession?.data?.client_secret as string | undefined) || undefined

  const ready =
    Boolean(stripeKey) && Boolean(stripePromise) && typeof clientSecret === "string"

  if (!ready) {
    if (typeof window !== "undefined") {
      console.warn("[StripeWrapper] Elements not mounted", {
        hasStripeKey: !!stripeKey,
        hasStripePromise: !!stripePromise,
        hasClientSecret: !!clientSecret,
        provider: paymentSession?.provider_id,
      })
    }
    // Критично: здесь контекст FALSE → Payment не попытается рендерить PaymentElement
    return <StripeContext.Provider value={false}>{children}</StripeContext.Provider>
  }

  const options: StripeElementsOptions = {
    clientSecret,
    appearance: { theme: "stripe" },
    locale: "en",
  }

  return (
    <Elements key={clientSecret} options={options} stripe={stripePromise!}>
      {/* Здесь контекст TRUE только если Elements реально смонтирован */}
      <StripeContext.Provider value={true}>{children}</StripeContext.Provider>
    </Elements>
  )
}

export default StripeWrapper
