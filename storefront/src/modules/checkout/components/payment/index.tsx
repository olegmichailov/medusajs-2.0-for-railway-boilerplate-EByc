"use client"

import { useCallback, useContext, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import ErrorMessage from "@modules/checkout/components/error-message"
import { CheckCircleSolid } from "@medusajs/icons"
import { Button, Container, Heading, Text, clx } from "@medusajs/ui"
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { StripePaymentElementChangeEvent } from "@stripe/stripe-js"
import Divider from "@modules/common/components/divider"
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
    (paymentSession: any) => paymentSession.status === "pending"
  )

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stripeComplete, setStripeComplete] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("")

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "payment"
  const stripeReady = useContext(StripeContext)
  const stripe = stripeReady ? useStripe() : null
  const elements = stripeReady ? useElements() : null

  const paidByGiftcard =
    cart?.gift_cards && cart.gift_cards.length > 0 && cart.total === 0

  const paymentReady =
    (activeSession && cart.shipping_methods.length !== 0) || paidByGiftcard

  // Preserve other query params while setting a new step param
  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set(name, value)
      return params.toString()
    },
    [searchParams]
  )

  const handlePaymentElementChange = async (
    event: StripePaymentElementChangeEvent
  ) => {
    if (event.value.type) {
      setSelectedPaymentMethod(event.value.type)
    }
    setStripeComplete(event.complete)
    if (event.complete) {
      setError(null)
    }
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    setError(null)
    try {
      if (!stripe || !elements) {
        setError("Payment processing not ready. Please try again.")
        return
      }
      await elements.submit().catch((err) => {
        console.error(err)
        setError(err.message || "An error occurred with the payment")
        return
      })
      router.push(pathname + "?" + createQueryString("step", "review"), {
        scroll: false,
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const initStripe = async () => {
    try {
      await initiatePaymentSession(cart, {
        // TODO: change the provider ID if using a different ID in medusa-config.ts
        provider_id: "pp_stripe_stripe",
      })
    } catch (err) {
      console.error("Failed to initialize Stripe session:", err)
      setError("Failed to initialize payment. Please try again.")
    }
  }

  useEffect(() => {
    if (!activeSession && isOpen) {
      initStripe()
    }
  }, [cart, isOpen, activeSession])

  return (
    <div className="bg-white">
      {/* Payment Step Header */}
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row text-3xl-regular gap-x-2 items-baseline",
            {
              "opacity-50 pointer-events-none select-none":
                !isOpen && !paymentReady,
            }
          )}
        >
          Payment
          {!isOpen && paymentReady && <CheckCircleSolid />}
        </Heading>
        {!isOpen && paymentReady && (
          <Text>
            <button
              onClick={() =>
                router.push(
                  pathname + "?" + createQueryString("step", "payment"),
                  { scroll: false }
                )
              }
              className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
              data-testid="edit-payment-button"
            >
              Edit
            </button>
          </Text>
        )}
      </div>

      {/* Payment Step Content */}
      <div>
        {/* Open (active) Payment form */}
        <div className={isOpen ? "block" : "hidden"}>
          {!paidByGiftcard &&
            availablePaymentMethods?.length &&
            stripeReady && (
              <div className="mt-5 transition-all duration-150 ease-in-out">
                <PaymentElement
                  onChange={handlePaymentElementChange}
                  options={{ layout: "accordion" }}
                />
              </div>
            )}

          {error && (
            <ErrorMessage
              error={error}
              data-testid="payment-error"
              className="mt-4"
            />
          )}

          <Button
            size="large"
            className="mt-6"
            onClick={handleSubmit}
            isLoading={isLoading}
            disabled={
              !stripeComplete ||
              !stripe ||
              !elements ||
              (!selectedPaymentMethod && !paidByGiftcard)
            }
            data-testid="submit-payment-button"
          >
            Continue to review
          </Button>
        </div>

        {/* Collapsed (completed) Payment summary */}
        <div
          className={
            !isOpen && paymentReady && activeSession && selectedPaymentMethod
              ? "block"
              : "hidden"
          }
        >
          <Text>Another step may appear</Text>
        </div>
      </div>
    </div>
  )
}

export default Payment
