"use client"

import React, { useMemo } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements } from "@stripe/react-stripe-js"
import PaymentElementForm from "@modules/checkout/components/payment/payment-element-form"
import { StripeContext } from "./stripe-context"
import { HttpTypes } from "@medusajs/types"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY!)

type StripeWrapperProps = {
  cart: HttpTypes.StoreCart
  paymentMethods: HttpTypes.StorePaymentCollection[]
  paymentSession: HttpTypes.StorePaymentSession
}

const StripeWrapper: React.FC<StripeWrapperProps> = ({
  cart,
  paymentMethods,
  paymentSession,
}) => {
  const clientSecret = paymentSession?.data?.client_secret

  const options = useMemo(
    () => ({
      clientSecret,
      appearance: {
        theme: "stripe",
        labels: "floating",
      },
    }),
    [clientSecret]
  )

  if (!clientSecret) {
    return null // или загрузчик
  }

  return (
    <StripeContext.Provider value={true}>
      <Elements stripe={stripePromise} options={options}>
        <PaymentElementForm cart={cart} paymentMethods={paymentMethods} />
      </Elements>
    </StripeContext.Provider>
  )
}

export default StripeWrapper
