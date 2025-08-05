import { placeOrder, retrieveCart } from "@lib/data/cart"
import { NextRequest, NextResponse } from "next/server"

type Params = { cartId: string }

export async function GET(
  req: NextRequest,
  { params }: { params: Params }
) {
  const { cartId } = params
  const { searchParams } = new URL(req.url)

  const paymentIntentClientSecret = searchParams.get("payment_intent_client_secret") || ""
  const paymentIntent = searchParams.get("payment_intent") || ""
  const redirectStatus = searchParams.get("redirect_status") || ""
  const countryCode = searchParams.get("country_code") || ""
  const origin = req.headers.get("origin") || ""

  const cart = await retrieveCart(cartId)

  if (!cart) {
    return NextResponse.redirect(`${origin}/${countryCode}`)
  }

  const paymentSession = cart.payment_session || cart.payment_sessions?.find(
    (p) => p.data.id === paymentIntent
  )

  if (
    !paymentSession ||
    paymentSession.data.client_secret !== paymentIntentClientSecret ||
    !["pending", "succeeded"].includes(redirectStatus) ||
    !["pending", "authorized"].includes(paymentSession.status)
  ) {
    return NextResponse.redirect(
      `${origin}/${countryCode}/cart?step=review&error=payment_failed`
    )
  }

  const order = await placeOrder(cartId)

  return NextResponse.redirect(`${origin}/${countryCode}/order/${order.id}/confirmed`)
}
