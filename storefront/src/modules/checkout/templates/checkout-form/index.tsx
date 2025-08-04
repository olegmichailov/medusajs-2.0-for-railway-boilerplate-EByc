"use client"

import { listCartShippingMethods } from "@lib/data/fulfillment"
import { listCartPaymentMethods } from "@lib/data/payment"
import { HttpTypes } from "@medusajs/types"
import Addresses from "@modules/checkout/components/addresses"
import Payment from "@modules/checkout/components/payment"
import Review from "@modules/checkout/components/review"
import Shipping from "@modules/checkout/components/shipping"
import dynamic from "next/dynamic"
import { loadStripe } from "@stripe/stripe-js"

const StripeWrapper = dynamic(
  () => import("@modules/checkout/components/payment-wrapper"),
  { ssr: false }
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

  const activeStripeSession = cart.payment_collection?.payment_sessions?.find(
    (s: any) => s.status === "pending" && s.provider_id === "stripe"
  )

  const stripeKey = process.env.NEXT_PUBLIC_STRIPE_KEY
  const stripePromise = stripeKey ? loadStripe(stripeKey) : null

  return (
    <div>
      <div className="w-full grid grid-cols-1 gap-y-8">
        <div>
          <Addresses cart={cart} customer={customer} />
        </div>

        <div>
          <Shipping cart={cart} availableShippingMethods={shippingMethods} />
        </div>

        <div>
          {activeStripeSession?.data?.client_secret && stripePromise ? (
            <StripeWrapper
              paymentSession={activeStripeSession}
              stripeKey={stripeKey}
              stripePromise={stripePromise}
            >
              <Payment cart={cart} availablePaymentMethods={paymentMethods} />
            </StripeWrapper>
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
