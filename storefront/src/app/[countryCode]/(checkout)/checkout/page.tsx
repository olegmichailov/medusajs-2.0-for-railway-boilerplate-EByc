import { Metadata } from "next"
import { redirect } from "next/navigation"

import Wrapper from "@modules/checkout/components/payment-wrapper"
import CheckoutForm from "@modules/checkout/templates/checkout-form"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"
import { enrichLineItems, retrieveCart } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { getCustomer } from "@lib/data/customer"

export const metadata: Metadata = {
  title: "Checkout",
}

// ВАЖНО: принимаем params и searchParams, чтобы корректно обрабатывать возвраты/отмены
export default async function Checkout({
  params,
  searchParams,
}: {
  params: { countryCode: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  // Если пришли после редиректа со статусами cancel/failed — не уходим в 404.
  const redirectStatus = (searchParams["redirect_status"] as string) || ""
  const isCanceledOrFailed =
    redirectStatus === "canceled" || redirectStatus === "failed"

  const cart = await retrieveCart()

  // Если корзины нет:
  //  - при cancel/failed отправляем обратно на корзину (мягкий возврат),
  //  - иначе (прямой заход на чек-аут без корзины) — тоже в корзину.
  if (!cart) {
    return redirect(`/${params.countryCode}/cart`)
  }

  // Если корзина есть — как и раньше, обогащаем айтемы
  if (cart?.items?.length) {
    const enrichedItems = await enrichLineItems(cart?.items, cart?.region_id!)
    ;(cart as any).items = enrichedItems as HttpTypes.StoreCartLineItem[]
  }

  // Если пришли с cancel/failed — принудительно возвращаем на шаг оплаты и чистим стейт.
  if (isCanceledOrFailed) {
    const usp = new URLSearchParams()
    usp.set("step", "payment")
    return redirect(`/${params.countryCode}/checkout?${usp.toString()}`)
  }

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
