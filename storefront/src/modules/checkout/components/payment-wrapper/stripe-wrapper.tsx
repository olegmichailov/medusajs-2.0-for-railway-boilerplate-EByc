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
 * Если чего-то не хватает (ключ/промис/client_secret), просто отдаёт детей как есть — без падений.
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
    // ничего не монтируем — вернём детей, чтобы UI не падал
    return <>{children}</>
  }

  const options: StripeElementsOptions = {
    clientSecret,
    locale: "en",
    appearance: { theme: "stripe" },
  }

  // key заставляет Elements корректно переинициализироваться при смене client_secret
  return (
    <Elements key={clientSecret} options={options} stripe={stripePromise}>
      {children}
    </Elements>
  )
}

export default StripeWrapper
