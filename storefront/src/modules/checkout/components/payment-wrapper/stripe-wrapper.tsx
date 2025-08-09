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
 * Безопасная обёртка Stripe Elements:
 * - не бросает исключений во время рендера;
 * - если нет данных для инициализации, просто рендерит детей как есть.
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

  // если что-то не готово — ничего не падает, просто возвращаем детей
  if (!stripeKey || !stripePromise || !clientSecret) {
    if (typeof window !== "undefined") {
      // только в браузере, чтобы не шуметь на сервере
      console.warn(
        "[StripeWrapper] Elements not mounted:",
        {
          hasStripeKey: !!stripeKey,
          hasStripePromise: !!stripePromise,
          hasClientSecret: !!clientSecret,
          provider: paymentSession?.provider_id,
        }
      )
    }
    return <>{children}</>
  }

  const options: StripeElementsOptions = {
    clientSecret,
    locale: "en",
    appearance: { theme: "stripe" },
  }

  // key заставляет Elements переинициализироваться при смене client_secret
  return (
    <Elements key={clientSecret} options={options} stripe={stripePromise}>
      {children}
    </Elements>
  )
}

export default StripeWrapper
