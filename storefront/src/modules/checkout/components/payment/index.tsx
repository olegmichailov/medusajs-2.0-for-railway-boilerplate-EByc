"use client"

import { useContext, useEffect, useState } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import ErrorMessage from "@modules/checkout/components/error-message"
import { CheckCircleSolid, CreditCard } from "@medusajs/icons"
import { Button, Container, Heading, Text, clx } from "@medusajs/ui"
import { PaymentElement, PaymentRequestButtonElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { StripePaymentElementChangeEvent } from "@stripe/stripe-js"
import { StripeContext } from "@modules/checkout/components/payment-wrapper/stripe-wrapper"
import Divider from "@modules/common/components/divider"
import { initiatePaymentSession } from "@lib/data/cart"
import { paymentInfoMap } from "@lib/constants"

const Payment = ({ cart, availablePaymentMethods }: { cart: any; availablePaymentMethods: any[] }) => {
  const activeSession = cart.payment_collection?.payment_sessions?.find((ps: any) => ps.status === "pending")

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

  const paidByGiftcard = cart?.gift_cards?.length > 0 && cart.total === 0
  const paymentReady = (activeSession && cart.shipping_methods.length !== 0) || paidByGiftcard

  // Create URL query string for navigation
  const createQueryString = (name: string, value: string) => {
    const params = new URLSearchParams(searchParams as any)
    params.set(name, value)
    return params.toString()
  }

  // Edit button handler (for collapsed view)
  const handleEdit = () => {
    router.push(pathname + "?" + createQueryString("step", "payment"), { scroll: false })
  }

  // Handle changes in the Stripe Payment Element (capture selected method and completion state)
  const handlePaymentElementChange = (event: StripePaymentElementChangeEvent) => {
    if (event.value.type) {
      setSelectedPaymentMethod(event.value.type)
    }
    setStripeComplete(event.complete)
    if (event.complete) {
      setError(null)
    }
  }

  // Handle clicking "Continue to review"
  const handleSubmit = async () => {
    setIsLoading(true)
    setError(null)
    try {
      if (!stripe || !elements) {
        setError("Payment processing not ready. Please try again.")
        return
      }
      // Submit payment details (does not confirm payment yet)
      await elements.submit().catch((err) => {
        console.error(err)
        setError(err.message || "An error occurred with the payment")
        return
      })
      // If submission succeeds, go to Review step
      router.push(pathname + "?" + createQueryString("step", "review"), { scroll: false })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // Initiate a Stripe payment session when entering the Payment step (if not already)
  const initStripe = async () => {
    try {
      await initiatePaymentSession(cart, { provider_id: "pp_stripe_stripe" })
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

  // Setup Apple Pay / Google Pay via Stripe Payment Request if available
  const [canUsePaymentRequest, setCanUsePaymentRequest] = useState(false)
  const [paymentRequest, setPaymentRequest] = useState<any>(null)
  useEffect(() => {
    if (stripe && elements && cart && stripeReady) {
      const pr = stripe.paymentRequest({
        country: "DE",  // use your country code if needed
        currency: cart.currency_code,
        total: { label: "Total", amount: cart.total || 0 },
        requestPayerName: true,
        requestPayerEmail: true,
      })
      pr.canMakePayment().then((result) => {
        if (result) {
          setCanUsePaymentRequest(true)
          setPaymentRequest(pr)
        }
      })
    }
  }, [stripe, elements, cart, stripeReady])

  return (
    <div className="bg-white">
      {/* Payment step header */}
      <div className="flex items-center justify-between mb-6">
        <Heading level="h2" className={clx("text-3xl-regular flex items-baseline gap-x-2", { "opacity-50 pointer-events-none select-none": !isOpen && !paymentReady })}>
          Payment { !isOpen && paymentReady && <CheckCircleSolid /> }
        </Heading>
        {!isOpen && paymentReady && (
          <Text>
            <button onClick={handleEdit} className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover">
              Edit
            </button>
          </Text>
        )}
      </div>

      {/* Payment step content */}
      <div>
        {/* Visible when on Payment step */}
        <div className={isOpen ? "block" : "hidden"}>
          {!paidByGiftcard && (
            <>
              {stripeReady && (
                <div className="mt-5 transition-all duration-150 ease-in-out">
                  {/* Stripe Payment Element to collect payment details */}
                  <PaymentElement onChange={handlePaymentElementChange} options={{ layout: "accordion" }} />
                  {canUsePaymentRequest && paymentRequest && (
                    <div className="mt-6">
                      <Text className="txt-medium-plus text-ui-fg-base mb-1">Or pay with:</Text>
                      <PaymentRequestButtonElement options={{ paymentRequest }} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {paidByGiftcard && (
            <div className="flex flex-col w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">Payment method</Text>
              <Text className="txt-medium text-ui-fg-subtle">Gift card</Text>
            </div>
          )}

          {/* Display any payment error */}
          <ErrorMessage error={error} />

          {/* Continue to Review button */}
          <Button 
            size="large" 
            className="mt-6" 
            onClick={handleSubmit} 
            isLoading={isLoading}
            disabled={!stripeComplete || !stripe || !elements || (!selectedPaymentMethod && !paidByGiftcard)}
          >
            Continue to review
          </Button>
        </div>

        {/* Collapsed summary view when Payment step is not open */}
        <div className={isOpen ? "hidden" : "block"}>
          {cart && paymentReady && activeSession ? (
            <div className="flex gap-x-4">
              <div className="flex flex-col w-1/3">
                <Text className="txt-medium-plus text-ui-fg-base mb-1">Payment method</Text>
                <Text className="txt-medium text-ui-fg-subtle">
                  {paymentInfoMap[selectedPaymentMethod]?.title || selectedPaymentMethod || "N/A"}
                </Text>
              </div>
              <div className="flex flex-col w-1/3">
                <Text className="txt-medium-plus text-ui-fg-base mb-1">Payment details</Text>
                <div className="flex items-center gap-2 txt-medium text-ui-fg-subtle">
                  <Container className="flex items-center h-7 w-fit p-2 bg-ui-button-neutral-hover">
                    {paymentInfoMap[selectedPaymentMethod]?.icon || <CreditCard />}
                  </Container>
                  <Text>
                    {selectedPaymentMethod 
                      ? `Paid via ${paymentInfoMap[selectedPaymentMethod]?.title || selectedPaymentMethod}` 
                      : "Provided via Stripe"}
                  </Text>
                </div>
              </div>
            </div>
          ) : paidByGiftcard ? (
            <div className="flex flex-col w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">Payment method</Text>
              <Text className="txt-medium text-ui-fg-subtle">Gift card</Text>
            </div>
          ) : null}
        </div>
      </div>

      <Divider className="mt-8" />
    </div>
  )
}

export default Payment
