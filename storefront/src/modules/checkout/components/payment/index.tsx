"use client"

import { useEffect, useState, useContext } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import ErrorMessage from "@modules/checkout/components/error-message"
import { CheckCircleSolid } from "@medusajs/icons"
import { Button, Heading, Text, clx } from "@medusajs/ui"
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import Divider from "@modules/common/components/divider"
import { StripeContext } from "@modules/checkout/components/payment-wrapper"

const Payment = ({ cart }: { cart: any }) => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stripeComplete, setStripeComplete] = useState(false)

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "payment"

  const stripeReady = useContext(StripeContext)
  const stripe = useStripe()
  const elements = useElements()

  const paymentReady = cart?.payment_collection?.payment_sessions.some(
    (session: any) => session.status === "pending"
  )

  const handleSubmit = async () => {
    setIsLoading(true)
    setError(null)

    if (!stripe || !elements) {
      setError("Stripe not initialized.")
      setIsLoading(false)
      return
    }

    const { error: submitError } = await elements.submit()

    if (submitError) {
      setError(submitError.message || "Stripe error during submit.")
      setIsLoading(false)
      return
    }

    router.push(pathname + "?step=review", { scroll: false })
  }

  useEffect(() => setError(null), [isOpen])

  return (
    <div className="bg-white">
      <div className="flex justify-between mb-6">
        <Heading level="h2" className={clx("text-3xl-regular", {
          "opacity-50": !isOpen && !paymentReady,
        })}>
          Payment {!isOpen && paymentReady && <CheckCircleSolid />}
        </Heading>
      </div>

      <div className={isOpen ? "block" : "hidden"}>
        {stripeReady && (
          <PaymentElement onChange={(e) => setStripeComplete(e.complete)} />
        )}

        <ErrorMessage error={error} />

        <Button
          className="mt-6"
          onClick={handleSubmit}
          isLoading={isLoading}
          disabled={!stripeComplete}
        >
          Continue to review
        </Button>
      </div>

      {!isOpen && paymentReady && <Text>Payment ready for review</Text>}
      <Divider className="mt-8" />
    </div>
  )
}

export default Payment
