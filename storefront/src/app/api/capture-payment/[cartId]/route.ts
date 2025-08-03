import { placeOrder, retrieveCart } from "@lib/data/cart"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest, { params }: { params: { cartId: string } }) {
  const { cartId } = params
  const { origin, searchParams } = req.nextUrl

  const paymentIntent = searchParams.get("payment_intent")
  const paymentIntentClientSecret = searchParams.get("payment_intent_client_secret")
  const redirectStatus = searchParams.get("redirect_status") || ""
  const countryCode = searchParams.get("country_code") || ""

  // Retrieve the latest state of the cart
  const cart = await retrieveCart(cartId)
  if (!cart) {
    // If cart no longer exists, redirect to homepage or cart page
    return NextResponse.redirect(`${origin}/${countryCode}`)
  }

  // Find the payment session corresponding to this payment intent
  const paymentSession = cart.payment_collection?.payment_sessions?.find(
    (session: any) => session.data?.id === paymentIntent
  )
  // Validate that payment session and Stripe parameters match expected values
  if (
    !paymentSession ||
    paymentSession.data?.client_secret !== paymentIntentClientSecret ||
    !["pending", "succeeded"].includes(redirectStatus) ||
    !["pending", "authorized"].includes(paymentSession.status)
  ) {
    // If validation fails, send the user back to the review step with an error
    return NextResponse.redirect(
      `${origin}/${countryCode}/cart?step=review&error=payment_failed`
    )
  }

  // Payment is confirmed/authorized – complete the cart to create an order
  const order = await placeOrder(cartId)
  // Redirect to the order confirmation page
  return NextResponse.redirect(`${origin}/${countryCode}/order/${order.id}/confirmed`)
}
