"use client"

import { listCartShippingMethods } from "@lib/data/fulfillment"
import { listCartPaymentMethods } from "@lib/data/payment"
import { HttpTypes } from "@medusajs/types"
import Addresses from "@modules/checkout/components/addresses"
import Payment from "@modules/checkout/components/payment"
import Review from "@modules/checkout/components/review"
import Shipping from "@modules/checkout/components/shipping"
import StripeWrapper from "@modules/checkout/components/payment-wrapper/stripe-wrapper"
import { Elements } from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "")

export default async function CheckoutForm({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) {
  if (!cart) return null

  const shippingMethods = await listCartShippingMethods(cart.id)
  const paymentMethods = await listCartPaymentMethods(cart.region?.id || "")

  const stripeSession = cart.payment_sessions?.find(
    (s) => s.provider_id === "stripe"
  )

  return (
    <div className="w-full grid grid-cols-1 gap-y-8">
      <Addresses cart={cart} customer={customer} />
      <Shipping cart={cart} availableShippingMethods={shippingMethods} />

      {stripeSession?.data?.client_secret && stripePromise ? (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret: stripeSession.data.client_secret,
            appearance: {
              theme: "flat",
              labels: "floating",
              variables: {
                fontFamily: "Barlow Condensed, sans-serif",
                borderRadius: "4px",
                colorPrimary: "#000000",
              },
            },
          }}
        >
          <StripeWrapper
            cart={cart}
            paymentMethods={paymentMethods}
            paymentSession={stripeSession}
          />
        </Elements>
      ) : (
        <Payment cart={cart} availablePaymentMethods={paymentMethods} />
      )}

      <Review cart={cart} />
    </div>
  )
}
