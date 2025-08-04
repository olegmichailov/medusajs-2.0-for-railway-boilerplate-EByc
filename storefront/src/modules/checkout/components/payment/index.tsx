"use client"

import { useCallback, useContext, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import ErrorMessage from "@modules/checkout/components/error-message"
import { CheckCircleSolid } from "@medusajs/icons"
import { Button, Heading, Text, clx } from "@medusajs/ui"
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { StripePaymentElementChangeEvent } from "@stripe/stripe-js"
import { StripeContext } from "@modules/checkout/components/payment-wrapper"
import { initiatePaymentSession } from "@lib/data/cart"

const Payment = ({
  cart,
  availablePaymentMethods,
}: {
  cart: any
  availablePaymentMethods: any[]
}) => {
  const activeSession = cart.payment_collection?.payment_sessions?.find(
    (s: any) => s.status === "pending"
  )

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stripeComplete, setStripeComplete] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("")

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "payment"
  const stripeReady = useContext(StripeContext)
  const stripe = stripeReady ? useStripe() : null
  const elements = stripeReady ? useElements() : null

  const paidByGiftcard = cart?.gift_cards?.length > 0 && cart.total === 0
  const paymentReady =
    (activeSession && cart.shipping_methods.length > 0) || paidByGiftcard

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set(name, value)
      return params.toString()
    },
    [searchParams]
  )

  const handleChange = (event: StripePaymentElementChangeEvent) => {
    if (event.value.type) setSelectedPaymentMethod(event.value.type)
    setStripeComplete(event.complete)
    if (event.complete) setError(null)
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    setError(null)
    if (!stripe || !elements) {
      setError("Stripe not initialized")
      return
    }
    try {
      await elements.submit()
      router.push(pathname + "?" + createQueryString("step", "review"), {
        scroll: false,
      })
    } catch (err: any) {
      setError(err.message || "Payment error")
    } finally {
      setIsLoading(false)
    }
  }

  const initStripe = async () => {
    try {
      await initiatePaymentSession(cart, {
        provider_id: "pp_stripe_stripe",
      })
    } catch (err) {
      setError("Could not start Stripe session")
    }
  }

  useEffect(() => {
    if (!activeSession && isOpen) {
      initStripe()
    }
  }, [cart, isOpen, activeSession])

  return (
    <div>
      <div className="flex justify-between mb-6">
        <Heading
          level="h2"
          className={clx("text-3xl", {
            "opacity-50 pointer-events-none select-none": !isOpen && !paymentReady,
          })}
        >
          Payment
          {!isOpen && paymentReady && <CheckCircleSolid />}
        </Heading>
        {!isOpen && paymentReady && (
          <Text>
            <button
              onClick={() =>
                router.push(pathname + "?" + createQueryString("step", "payment"), {
                  scroll: false,
                })
              }
              className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
            >
              Edit
            </button>
          </Text>
        )}
      </div>

      <div>
        <div className={isOpen ? "block" : "hidden"}>
          {!paidByGiftcard && stripeReady && (
            <div className="mt-5">
              <PaymentElement onChange={handleChange} options={{ layout: "accordion" }} />
            </div>
          )}
          {error && <ErrorMessage error={error} className="mt-4" />}
          <Button
            size="large"
            className="mt-6"
            onClick={handleSubmit}
            isLoading={isLoading}
            disabled={
              !stripeComplete || !stripe || !elements || (!selectedPaymentMethod && !paidByGiftcard)
            }
          >
            Continue to review
          </Button>
        </div>

        <div
          className={
            !isOpen && paymentReady && activeSession && selectedPaymentMethod
              ? "block"
              : "hidden"
          }
        >
          <Text>Payment ready</Text>
        </div>
      </div>
    </div>
  )
}

export default Payment
