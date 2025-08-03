"use server"

import { notFound } from "next/navigation"
import { enrichLineItems, retrieveCart, createPaymentSessions } from "@lib/data/cart"
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
    const enrichedItems = await enrichLineItems(cart.items, cart.region_id!)
    cart.items = enrichedItems as HttpTypes.StoreCartLineItem[]
  }

  const hasValidSessions =
    cart.payment_collection?.payment_sessions?.length &&
    cart.payment_collection.payment_sessions.some((s) => s.status === "pending")

  if (!hasValidSessions && cart.id) {
    try {
      console.log("📦 No valid payment session. Creating now...")
      await createPaymentSessions(cart.id)
    } catch (error) {
      console.error("❌ Failed to create payment sessions", error)
    }

    // Повторно получаем cart после создания сессий
    cart = await retrieveCart()
    if (!cart?.payment_collection?.payment_sessions?.some((s) => s.status === "pending")) {
      console.error("❌ Still no valid Stripe session after creation.")
    } else {
      console.log("✅ Stripe session successfully created.")
    }
  }

  return cart
}

export default async function Checkout() {
  const cart = await fetchCartWithSessions()
  const customer = await getCustomer()

  return (
    <div className="grid grid-cols-1 small:grid-cols-[1fr_416px] content-container gap-x-40 py-12">
      <Wrapper cart={cart}>
        <CheckoutForm cart={cart} customer={customer} />
      </Wrapper>
      <CheckoutSummary cart={cart} />
    </div>
  )
}
