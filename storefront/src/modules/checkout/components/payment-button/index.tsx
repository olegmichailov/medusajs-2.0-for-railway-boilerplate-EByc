"use client"

import { useEffect, useState, useContext } from "react"
import { useParams, usePathname, useRouter } from "next/navigation"
import { Button } from "@medusajs/ui"
import { useStripe, useElements } from "@stripe/react-stripe-js"
import { StripeContext } from "@modules/checkout/components/payment-wrapper/stripe-wrapper"
import { placeOrder } from "@lib/data/cart"
import { isStripe as isStripeFunc } from "@lib/constants"

const PaymentButton = ({ cart }: { cart: any }) => {
  const { countryCode } = useParams()
  const router = useRouter()
  const pathname = usePathname()

  const stripeReady = useContext(StripeContext)
  const stripe = stripeReady ? useStripe() : null
  const elements = stripeReady ? useElements() : null

  const paymentSession = cart.payment_collection?.payment_sessions?.find((session: any) => session.status === "pending")

  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Helper to complete the order in Medusa and redirect to confirmation
  const completeOrder = async () => {
    try {
      const order = await placeOrder(cart.id)
      router.push(`/${countryCode}/order/${order.id}/confirmed`)
    } catch (err) {
      console.error("Error completing order:", err)
      setErrorMessage("Failed to place order. Please try again.")
      setSubmitting(false)
    }
  }

  const handlePayment = async () => {
    // Stripe Payment Element flow
    if (paymentSession && isStripeFunc(paymentSession.provider_id) && stripe && elements) {
      setSubmitting(true)
      setErrorMessage(null)
      // Ensure Payment Element details are submitted (especially if returning from an external redirect like PayPal)
      const { error: submitError } = await elements.submit()
      if (submitError) {
        setErrorMessage(submitError.message || "Payment submission failed.")
        setSubmitting(false)
        return
      }
      const clientSecret = paymentSession.data?.client_secret as string
      try {
        await stripe.confirmPayment({
          elements,
          clientSecret,
          confirmParams: {
            // Stripe will redirect here after external payment methods (PayPal, 3D Secure, etc.)
            return_url: `${window.location.origin}/api/capture-payment/${cart.id}?country_code=${countryCode}`,
            payment_method_data: {
              billing_details: {
                name: `${cart.billing_address?.first_name || ""} ${cart.billing_address?.last_name || ""}`,
                address: {
                  city: cart.billing_address?.city ?? undefined,
                  country: cart.billing_address?.country_code ?? undefined,
                  line1: cart.billing_address?.address_1 ?? undefined,
                  line2: cart.billing_address?.address_2 ?? undefined,
                  postal_code: cart.billing_address?.postal_code ?? undefined,
                  state: cart.billing_address?.province ?? undefined,
                },
                email: cart.email,
                phone: cart.billing_address?.phone ?? undefined,
              },
            },
          },
          redirect: "if_required",
        }).then(async ({ error, paymentIntent }) => {
          if (error) {
            const pi = (error as any).payment_intent
            if (pi && (pi.status === "requires_capture" || pi.status === "succeeded")) {
              // Payment is authorized or already captured – complete the order
              await completeOrder()
              return
            }
            // Other errors (payment failed or was canceled)
            setErrorMessage(error.message || "Payment failed. Please try again.")
            setSubmitting(false)
            return
          }
          if (paymentIntent) {
            if (paymentIntent.status === "requires_capture" || paymentIntent.status === "succeeded") {
              // Payment succeeded (no redirect needed)
              await completeOrder()
              return
            }
          }
        })
      } catch (err: any) {
        console.error("Stripe confirmation error:", err)
        setErrorMessage(err.message || "Payment confirmation failed.")
        setSubmitting(false)
      }
    } 
    // Non-Stripe or free checkout flow (e.g., fully paid by gift card)
    else {
      setSubmitting(true)
      setErrorMessage(null)
      try {
        const order = await placeOrder(cart.id)
        router.push(`/${countryCode}/order/${order.id}/confirmed`)
      } catch (err) {
        console.error("Order placement error:", err)
        setErrorMessage("Failed to place order. Please try again.")
      } finally {
        setSubmitting(false)
      }
    }
  }

  // If a payment failure occurred (captured via the return URL), redirect back to Payment step so user can fix it
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("error") === "payment_failed") {
      router.push(pathname + "?step=payment")
    }
  }, [pathname, router])

  return (
    <div>
      {errorMessage && <p className="text-red-600 mb-2">{errorMessage}</p>}
      <Button variant="primary" onClick={handlePayment} isLoading={submitting}>
        Place order
      </Button>
    </div>
  )
}

export default PaymentButton
