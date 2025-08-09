import { Metadata } from "next"
import { redirect } from "next/navigation"

import Wrapper from "@modules/checkout/components/payment-wrapper"
import CheckoutForm from "@modules/checkout/templates/checkout-form"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"
import { enrichLineItems, retrieveCart } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"

export const metadata: Metadata = {
  title: "Checkout",
}

async function fetchCart() {
  const cart = await retrieveCart()
  if (!cart) {
    return null
  }

  if (cart?.items?.length) {
    const enrichedItems = await enrichLineItems(cart.items, cart.region_id!)
    cart.items = enrichedItems as HttpTypes.StoreCartLineItem[]
  }

  return cart
}

type PageProps = {
  params: { countryCode: string }
  searchParams: Record<string, string | string[] | undefined>
}

export default async function Checkout({ params, searchParams }: PageProps) {
  const country = params.countryCode

  // 1) Серверная обработка возврата/отмены redirect-методов Stripe
  const rs = (searchParams.redirect_status as string | undefined)?.toLowerCase()
  if (rs === "canceled" || rs === "failed") {
    // Чистим все stripe-параметры и возвращаем пользователя на шаг оплаты
    const clean = new URLSearchParams()
    clean.set("step", "payment")
    redirect(`/${country}/checkout?${clean.toString()}`)
  }

  // 2) Обычная загрузка корзины
  const cart = await fetchCart()

  // 3) Если корзины нет, отправляем на /cart вместо 404
  if (!cart) {
    redirect(`/${country}/cart`)
  }

  return (
    <div className="grid grid-cols-1 small:grid-cols-[1fr_416px] content-container gap-x-40 py-12">
      <Wrapper cart={cart}>
        <CheckoutForm cart={cart} customer={null} />
      </Wrapper>
      <CheckoutSummary cart={cart} />
    </div>
  )
}
