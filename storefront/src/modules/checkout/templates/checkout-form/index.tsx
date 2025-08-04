"use client"

import { listCartShippingMethods } from "@lib/data/fulfillment"
import { listCartPaymentMethods } from "@lib/data/payment"
import { HttpTypes } from "@medusajs/types"
import Addresses from "@modules/checkout/components/addresses"
import Payment from "@modules/checkout/components/payment"
import Review from "@modules/checkout/components/review"
import Shipping from "@modules/checkout/components/shipping"
import { Elements } from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"
import StripeWrapper from "@modules/checkout/components/payment-wrapper/stripe-wrapper"

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
)

export default async function CheckoutForm({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) {
  if (!cart) {
    return null
  }

  const shippingMethods = await listCartShippingMethods(cart.id)
  const paymentMethods = await listCartPaymentMethods(cart.region?.id ?? "")

  if (!shippingMethods || !paymentMethods) {
    return null
  }

  const stripePaymentSession = cart.payment_sessions?.find(
    (session) => session.provider_id === "stripe"
  )

  const options = stripePaymentSession?.data?.client_secret
    ? {
        clientSecret: stripePaymentSession.data.client_secret,
        appearance: {
          theme: "stripe",
        },
      }
    : undefined

  return (
    <div>
      <div className="w-full grid grid-cols-1 gap-y-8">
        <div>
          <Addresses cart={cart} customer={customer} />
        </div>

        <div>
          <Shipping cart={cart} availableShippingMethods={shippingMethods} />
        </div>

        {/* Stripe Elements wrapper */}
        <div>
          {options ? (
            <Elements stripe={stripePromise} options={options}>
              <StripeWrapper cart={cart} paymentMethods={paymentMethods} />
            </Elements>
          ) : (
            <Payment cart={cart} availablePaymentMethods={paymentMethods} />
          )}
        </div>

        <div>
          <Review cart={cart} />
        </div>
      </div>
    </div>
  )
}
