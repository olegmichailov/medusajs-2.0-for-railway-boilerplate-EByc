"use client"

import { useState, useEffect, useCallback, useContext } from "react"
import { useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js"
import { StripePaymentElementChangeEvent } from "@stripe/stripe-js"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Button, Heading, Text, clx } from "@medusajs/ui"
import { CheckCircleSolid } from "@medusajs/icons"
import ErrorMessage from "@modules/checkout/components/error-message"
import { StripeContext } from "@modules/checkout/components/payment-wrapper"
import { initiatePaymentSession } from "@lib/data/cart"

const Payment = ({ cart, availablePaymentMethods }: { cart: any; availablePaymentMethods: any[] }) => {
  const stripe = useStripe()
  const elements = useElements()
  const stripeReady = useContext(StripeContext)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [paymentComplete, setPaymentComplete] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const activeSession = cart.payment_collection?.payment_sessions?.find((s: any) => s.status === "pending")

  const isOpen = searchParams.get("step") === "payment"
  const paidByGiftcard = cart?.gift_cards?.length && cart.total === 0
  const paymentReady = (activeSession && cart.shipping_methods.length) || paidByGiftcard

  const createQueryString = useCallback((name: string, value: string) => {
    const params = new URLSearchParams(searchParams)
    params.set(name, value)
    return params.toString()
  }, [searchParams])

  useEffect(() => {
    if (!activeSession && isOpen) {
      initiatePaymentSession(cart, { provider_id: "stripe" })
        .catch(err => setError("Failed to initialize Stripe session"))
    }
  }, [activeSession, isOpen, cart])

  const handleChange = (event: StripePaymentElementChangeEvent) => {
    setPaymentComplete(event.complete)
    setError(event.error?.message || null)
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    if (!stripe || !elements) {
      setError("Stripe not ready")
      setIsLoading(false)
      return
    }

    await elements.submit().then(() => {
      router.push(`${pathname}?${createQueryString("step", "review")}`)
    }).catch((e) => setError(e.message || "Payment error")).finally(() => setIsLoading(false))
  }

  return (
    <div className="bg-white p-6">
      <Heading level="h2" className={clx("flex items-baseline gap-x-2", { "opacity-50": !isOpen && !paymentReady })}>
        Payment {!isOpen && paymentReady && <CheckCircleSolid />}
      </Heading>

      {isOpen && !paidByGiftcard && stripeReady && (
        <div className="mt-4">
          <PaymentElement options={{ layout: "accordion" }} onChange={handleChange} />
          {error && <ErrorMessage error={error} />}
          <Button className="mt-4" onClick={handleSubmit} isLoading={isLoading} disabled={!paymentComplete || !stripe}>
            Continue to Review
          </Button>
        </div>
      )}
    </div>
  )
}

export default Payment
