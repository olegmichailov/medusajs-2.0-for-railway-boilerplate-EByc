"use client"

import { useEffect, useState } from "react"
import { listCartShippingMethods } from "@lib/data/fulfillment"
import { listCartPaymentMethods } from "@lib/data/payment"
import { HttpTypes } from "@medusajs/types"
import Addresses from "@modules/checkout/components/addresses"
import Payment from "@modules/checkout/components/payment"
import Review from "@modules/checkout/components/review"
import Shipping from "@modules/checkout/components/shipping"
import StripeWrapper from "@modules/checkout/components/payment-wrapper/stripe-wrapper"

export default function CheckoutForm({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) {
  const [shippingMethods, setShippingMethods] = useState<HttpTypes.StoreShippingOption[] | null>(null)
  const [paymentMethods, setPaymentMethods] = useState<HttpTypes.StorePaymentCollection[] | null>(null)

  useEffect(() => {
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

  const stripeSession = cart.payment_sessions?.find(
    (s) => s.provider_id === "stripe"
  )

  return (
    <div className="w-full grid grid-cols-1 gap-y-8">
      <Addresses cart={cart} customer={customer} />

      <Shipping cart={cart} availableShippingMethods={shippingMethods} />

      <div>
        {stripeSession?.data?.client_secret ? (
          <StripeWrapper
            cart={cart}
            paymentMethods={paymentMethods}
            paymentSession={stripeSession}
          />
        ) : (
          <Payment
            cart={cart}
            availablePaymentMethods={paymentMethods}
          />
        )}
      </div>

      <Review cart={cart} />
    </div>
  )
}
