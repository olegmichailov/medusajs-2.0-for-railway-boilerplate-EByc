"use client"
import React, { useContext, useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import { StripePaymentElementChangeEvent } from "@stripe/stripe-js"
import { StripeContext } from "../payment-wrapper/stripe-wrapper"
import { initiatePaymentSession } from "@lib/data/cart"

// (Assuming useCart provides cart and checkout state like availablePaymentMethods, etc.)
import { useCart } from "@lib/context/cart" 

interface PaymentProps {
  isOpen: boolean          // whether this Payment step is currently active/open
  availablePaymentMethods: string[]  // list of available payment provider IDs (from region)
  paidByGiftcard?: boolean // if the cart is fully paid by gift card
  onPaymentCompleted?: () => void    // callback when payment step is completed (optional, likely handled in review step)
}

const Payment: React.FC<PaymentProps> = ({ isOpen, availablePaymentMethods, paidByGiftcard }) => {
  const { cart } = useCart()
  const router = useRouter()
  const pathname = usePathname()

  // Stripe integration state
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stripeComplete, setStripeComplete] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("")

  // Stripe context to know if Elements is ready
  const stripeReady = useContext(StripeContext)
  const stripe = stripeReady ? useStripe() : null
  const elements = stripeReady ? useElements() : null

  // Detect if a Stripe payment session is already active for this cart
  const activeSession = cart?.payment_collection?.payment_sessions?.find(
    (session: any) => session.provider_id === "pp_stripe_stripe"
  )

  // Handle changes in the Payment Element (e.g. selecting payment method or form completion)
  const handlePaymentElementChange = (event: StripePaymentElementChangeEvent) => {
    if (event.value?.type) {
      setSelectedPaymentMethod(event.value.type)
    }
    setStripeComplete(event.complete)
    if (event.complete) {
      setError(null)
    }
  }

  // Create or ensure a Stripe Payment Session when entering the Payment step
  const initStripe = async () => {
    try {
      await initiatePaymentSession(cart, { provider_id: "pp_stripe_stripe" })
    } catch (err) {
      console.error("Failed to initialize Stripe session:", err)
      setError("Failed to initialize payment. Please try again.")
    }
  }

  useEffect(() => {
    // When the Payment step opens and no Stripe session exists, initialize it
    if (!activeSession && isOpen) {
      initStripe()
    }
  }, [activeSession, isOpen, cart])

  // Helper to preserve existing query params and append/replace one
  const createQueryString = (name: string, value: string) => {
    const params = new URLSearchParams(window.location.search)
    params.set(name, value)
    return params.toString()
  }

  // Handle clicking the "Continue to review" button
  const handleSubmit = async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Ensure Stripe.js is ready
      if (!stripe || !elements) {
        setError("Payment processing not ready. Please try again.")
        return
      }
      // Submit the payment method details from the Payment Element (does not confirm payment yet)
      await elements.submit().catch((err) => {
        console.error(err)
        setError(err.message || "An error occurred with the payment")
        return
      })
      // Upon successful submission, proceed to the Review step
      router.push(pathname + "?" + createQueryString("step", "review"), { scroll: false })
    } catch (err: any) {
      setError(err.message || "Unable to proceed. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="payment-step">
      {!paidByGiftcard && !!availablePaymentMethods?.length && stripeReady && (
        <div className="mt-5 transition-all duration-150 ease-in-out">
          <PaymentElement 
            onChange={handlePaymentElementChange} 
            options={{ layout: "accordion" }} 
          />
        </div>
      )}

      {error && (
        <div className="mt-4 text-red-500">
          {error}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary mt-6"
        onClick={handleSubmit}
        disabled={
          isLoading || 
          !stripeComplete || 
          !stripe || 
          !elements || 
          (!selectedPaymentMethod && !paidByGiftcard)
        }
      >
        {isLoading ? "Processing..." : "Continue to review"}
      </button>
    </div>
  )
}

export default Payment
