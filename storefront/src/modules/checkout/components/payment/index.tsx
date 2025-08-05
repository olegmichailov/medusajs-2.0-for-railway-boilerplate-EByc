"use client"

import React, { useContext, useState, useEffect } from "react"
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { Button, Heading, Text } from "@medusajs/ui"
import { StripeContext } from "../payment-wrapper"
import ErrorMessage from "../error-message"
import { initiatePaymentSession } from "@lib/data/cart"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

const Payment = ({ cart, availablePaymentMethods }) => {
  const stripe = useStripe()
  const elements = useElements()
  const stripeReady = useContext(StripeContext)

  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const activeSession = cart.payment_collection?.payment_sessions?.find(
    (session) => session.status === "pending"
  )

  const handleSubmit = async () => {
    setIsLoading(true)
    setError(null)

    if (!stripe || !elements) {
      setError("Stripe is not loaded yet.")
      setIsLoading(false)
      return
    }

    try {
      await elements.submit()
      router.push(`${pathname}?${new URLSearchParams({ step: "review" })}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!activeSession) {
      initiatePaymentSession(cart, { provider_id: "stripe" })
    }
  }, [activeSession, cart])

  if (!stripeReady) {
    return <div>Loading payment methods...</div>
  }

  return (
    <div>
      <Heading level="h2">Payment</Heading>
      <PaymentElement options={{ layout: "accordion" }} />
      {error && <ErrorMessage error={error} />}
      <Button onClick={handleSubmit} isLoading={isLoading}>
        Continue to review
      </Button>
    </div>
  )
}

export default Payment
