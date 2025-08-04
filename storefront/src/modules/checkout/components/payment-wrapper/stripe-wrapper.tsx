"use client"

import React, { useMemo } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements } from "@stripe/react-stripe-js"
import PaymentElementForm from "@modules/checkout/components/payment/payment-element-form"
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
        theme: "flat",
        labels: "floating",
        variables: {
          fontFamily: "Barlow Condensed, sans-serif",
          borderRadius: "4px",
          colorPrimary: "#000000",
        },
      },
    }),
    [clientSecret]
  )

  if (!clientSecret) return null

  return (
    <Elements stripe={stripePromise} options={options}>
      <PaymentElementForm
        cart={cart}
        paymentMethods={paymentMethods}
      />
    </Elements>
  )
}

export default StripeWrapper
