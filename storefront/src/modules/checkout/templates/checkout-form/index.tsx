"use client"

import { useEffect, useState } from "react"
import { listCartShippingMethods } from "@lib/data/fulfillment"
import { listCartPaymentMethods } from "@lib/data/payment"
import { HttpTypes } from "@medusajs/types"
import Addresses from "@modules/checkout/components/addresses"
import Payment from "@modules/checkout/components/payment"
import Review from "@modules/checkout/components/review"
import Shipping from "@modules/checkout/components/shipping"
import { loadStripe, Stripe } from "@stripe/stripe-js"
import { Elements } from "@stripe/react-stripe-js"
import StripeWrapper from "@modules/checkout/components/payment-wrapper/stripe-wrapper"

export default function CheckoutForm({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null)
  const [shippingMethods, setShippingMethods] = useState<HttpTypes.StoreShippingOption[] | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<HttpTypes.StorePaymentCollection[] | null>(null)

  useEffect(() => {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (publishableKey) {
      setStripePromise(loadStripe(publishableKey))
    }

    const loadData = async () => {
      if (cart?.id && cart?.region?.id) {
        const [shipping, payment] = await Promise.all([
          listCartShippingMethods(cart.id),
          listCartPaymentMethods(cart.region.id),
        ])
        setShippingMethods(shipping)
        setPaymentMethods(payment)
      }
    }

    loadData()
  }, [cart?.id, cart?.region?.id])

  if (!cart || !shippingMethods || !paymentMethods) {
    return null
  }

  const stripePaymentSession = cart.payment_sessions?.find(
    (session) => session.provider_id === "stripe"
  )

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
          {stripePromise && stripePaymentSession?.data?.client_secret ? (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: stripePaymentSession.data.client_secret,
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
                paymentSession={stripePaymentSession}
              />
            </Elements>
          ) : (
            <Payment
              cart={cart}
              availablePaymentMethods={paymentMethods}
            />
          )}
        </div>

        <div>
          <Review cart={cart} />
        </div>
      </div>
    </div>
  )
}
