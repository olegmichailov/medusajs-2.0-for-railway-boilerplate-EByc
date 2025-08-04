"use client"

import { HttpTypes } from "@medusajs/types"
import React from "react"
import PaymentElementForm from "@modules/checkout/components/payment/payment-element-form"

type StripeWrapperProps = {
  cart: HttpTypes.StoreCart
  paymentMethods: HttpTypes.StorePaymentCollection[]
  paymentSession: HttpTypes.StorePaymentSession
}

const StripeWrapper: React.FC<StripeWrapperProps> = ({
  cart,
  paymentMethods,
}) => {
  return (
    <div className="flex flex-col gap-y-4">
      <PaymentElementForm cart={cart} paymentMethods={paymentMethods} />
    </div>
  )
}

export default StripeWrapper
