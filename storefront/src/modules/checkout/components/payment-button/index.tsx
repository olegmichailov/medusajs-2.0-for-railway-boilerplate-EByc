"use client"
import React, { useEffect } from "react"
import { useParams, usePathname, useRouter } from "next/navigation"
import { useStripe, useElements } from "@stripe/react-stripe-js"
import { useCart } from "@lib/context/cart"

interface PaymentButtonProps {
  onPaymentCompleted: () => void   // function to call when payment is completed (places order)
}

const PaymentButton: React.FC<PaymentButtonProps> = ({ onPaymentCompleted }) => {
  const { cart } = useCart()
  const { countryCode } = useParams()  // assuming the route includes a country code param
  const router = useRouter()
  const pathname = usePathname()

  const stripe = useStripe()
  const elements = useElements()

  // Find the Stripe payment session on the cart (to get client_secret)
  const paymentSession = cart.payment_collection?.payment_sessions?.find(
    (session: any) => session.provider_id === "pp_stripe_stripe"
  )

  // Handle clicking the "Place order" button (confirm payment and complete order)
  const handlePayment = async () => {
    if (!stripe || !elements || !cart) {
      return
    }
    // Indicate loading state if needed (not shown here for brevity)

    // First, ensure any Payment Element fields are submitted
    const { error: submitError } = await elements.submit()
    if (submitError) {
      // If there's an error in the Payment Element (e.g., incomplete fields), handle it
      // For example, show error message (not shown here for brevity)
      return
    }

    const clientSecret = paymentSession?.data?.client_secret as string
    await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: {
        // Return URL for Stripe to redirect after external wallet payments (if any)
        return_url: `${window.location.origin}/api/capture-payment/${cart.id}?country_code=${countryCode}`
      },
      redirect: "if_required"
    })
    .then(({ error, paymentIntent }) => {
      if (error) {
        const pi = error.payment_intent
        // If payment is already authorized or succeeded, treat it as completed
        if ((pi && pi.status === "requires_capture") || (pi && pi.status === "succeeded")) {
          onPaymentCompleted()
          return
        }
        // Otherwise, handle the error (e.g., show error message to user)
        // Not fully shown here for brevity
        return
      }
      // If no error, check status of PaymentIntent
      if (paymentIntent && (paymentIntent.status === "requires_capture" || paymentIntent.status === "succeeded")) {
        // Payment is authorized or captured, proceed to place order
        onPaymentCompleted()
      }
    })
  }

  // Effect: if the cart's payment collection status becomes "authorized", finalize the order
  useEffect(() => {
    if (cart.payment_collection?.status === "authorized") {
      onPaymentCompleted()
    }
  }, [cart.payment_collection?.status])

  // Effect: Listen to Payment Element changes, redirect back to payment step if the form becomes incomplete
  useEffect(() => {
    elements?.getElement("payment")?.on("change", (e: any) => {
      if (!e.complete) {
        // If payment details are incomplete, redirect user back to Payment step
        router.push(pathname + "?step=payment", { scroll: false })
      }
    })
  }, [elements, router, pathname])

  return (
    <button 
      type="button" 
      className="btn btn-primary" 
      onClick={handlePayment}
    >
      Place order
    </button>
  )
}

export default PaymentButton
