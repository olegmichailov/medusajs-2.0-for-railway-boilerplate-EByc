import { NextRequest, NextResponse } from "next/server"
import { placeOrder, retrieveCart } from "@lib/data/cart"

type Params = { cartId: string }

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const cartId = params.cartId
  const { searchParams } = req.nextUrl

  const paymentIntentId = searchParams.get("payment_intent")
  const paymentIntentClientSecret = searchParams.get("payment_intent_client_secret")
  const redirectStatus = searchParams.get("redirect_status") || ""
  const countryCode = searchParams.get("country_code") || ""

  const cart = await retrieveCart(cartId)
  if (!cart) {
    // Cart not found, redirect to store homepage (or cart page)
    return NextResponse.redirect(`${req.nextUrl.origin}/${countryCode}`)
  }

  // Find the corresponding payment session on the cart by Payment Intent ID
  const paymentSession = cart.payment_collection?.payment_sessions?.find(
    (session: any) => session.data?.id === paymentIntentId
  )

  // Validate that the payment session and client secret match, and that the redirect status is OK
  const validPayment = paymentSession 
    && paymentSession.data?.client_secret === paymentIntentClientSecret 
    && ["pending", "succeeded"].includes(redirectStatus) 
    && ["pending", "authorized"].includes(paymentSession.status)

  if (!validPayment) {
    // If validation fails or payment not successful, redirect back to checkout review step with error
    return NextResponse.redirect(`${req.nextUrl.origin}/${countryCode}/cart?step=review&error=payment_failed`)
  }

  // Payment is authorized or succeeded, so place the order in Medusa
  try {
    const order = await placeOrder(cartId)
    // Redirect to order confirmation page
    return NextResponse.redirect(`${req.nextUrl.origin}/${countryCode}/order/${order.id}/confirmed`)
  } catch (error) {
    console.error("Order placement failed:", error)
    // Redirect back to review step with error if order placement fails
    return NextResponse.redirect(`${req.nextUrl.origin}/${countryCode}/cart?step=review&error=order_failed`)
  }
}
