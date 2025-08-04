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
  const clientSecret = paymentSession?.data?.client_secret

  if (!stripeKey) {
    console.error("❌ Stripe key is missing. Set NEXT_PUBLIC_STRIPE_KEY.")
    return null
  }

  if (!stripePromise) {
    console.error("❌ Stripe promise is missing. Check loadStripe initialization.")
    return null
  }

  if (!clientSecret) {
    console.error("❌ Stripe client secret is missing. Cannot initialize Elements.")
    return null
  }

  const options: StripeElementsOptions = {
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
  }

  return (
    <Elements options={options} stripe={stripePromise}>
      {children}
    </Elements>
  )
}

export default StripeWrapper
