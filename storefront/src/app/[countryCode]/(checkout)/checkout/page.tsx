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

  if (!cart) return notFound()

  if (cart?.items?.length) {
    const enrichedItems = await enrichLineItems(
      cart.items,
      cart.region_id!
    )
    cart.items = enrichedItems as HttpTypes.StoreCartLineItem[]
  }

  // Всегда гарантируем, что есть актуальные платежные сессии
  const hasValidSessions =
    cart.payment_collection?.payment_sessions?.some((s) => s.status === "pending")

  if (!hasValidSessions && cart.id) {
    try {
      await createPaymentSessions(cart.id)
      cart = await retrieveCart() // рефреш cart
    } catch (error) {
      console.error("❌ Failed to create payment sessions", error)
      // можно прокинуть ошибку в UI, если нужно
    }
  }

  return cart
}

export default async function CheckoutPage() {
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
