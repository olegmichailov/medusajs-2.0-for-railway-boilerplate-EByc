// storefront/src/app/[countryCode]/(checkout)/checkout/page.tsx

"use server"

import { notFound } from "next/navigation"
import {
  enrichLineItems,
  retrieveCart,
  createPaymentSessions,
} from "@lib/data/cart"
import { getCustomer } from "@lib/data/customer"
import { HttpTypes } from "@medusajs/types"

import Wrapper from "@modules/checkout/components/payment-wrapper"
import CheckoutForm from "@modules/checkout/templates/checkout-form"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"

export async function generateMetadata() {
  return {
    title: "Checkout",
  }
}

const fetchCartWithSessions = async () => {
  let cart = await retrieveCart()

  if (!cart) {
    return notFound()
  }

  if (cart?.items?.length) {
    const enrichedItems = await enrichLineItems(
      cart.items,
      cart.region_id!
    )
    cart.items = enrichedItems as HttpTypes.StoreCartLineItem[]
  }

  // CREATE SESSIONS, если нету актуальных!
  const hasValidSessions =
    cart.payment_session ||
    (cart.payment_collection?.payment_sessions?.length &&
      cart.payment_collection.payment_sessions.some(
        (s) => s.status === "pending"
      ))

  if (!hasValidSessions && cart.id) {
    try {
      await createPaymentSessions(cart.id)
      cart = await retrieveCart()
    } catch (error) {
      console.error("❌ Failed to create payment sessions", error)
    }
  }

  return cart
}

export default async function CheckoutPage() {
  const cart = await fetchCartWithSessions()
  const customer = await getCustomer()

  // ВАЖНО! Получаем только если есть сессии!
  const paymentSession = cart?.payment_collection?.payment_sessions?.find(
    (s) => s.provider_id === "stripe" && s.data?.client_secret
  )

  // Не даём рендериться Stripe раньше времени
  if (!paymentSession && cart?.payment_collection?.payment_sessions?.length) {
    return <div>Loading payment session...</div>
  }

  return (
    <div className="grid grid-cols-1 small:grid-cols-[1fr_416px] content-container gap-x-40 py-12">
      <Wrapper cart={cart} paymentSession={paymentSession}>
        <CheckoutForm cart={cart} customer={customer} />
      </Wrapper>
      <CheckoutSummary cart={cart} />
    </div>
  )
}
