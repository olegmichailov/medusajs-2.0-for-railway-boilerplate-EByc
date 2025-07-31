import { NextResponse } from "next/server"
import { stripe } from "@lib/stripe" // путь зависит от твоего проекта
import { MedusaClient } from "@lib/config"

export async function POST(req: Request) {
  const body = await req.json()
  const { cart_id } = body

  try {
    // получаем cart c учётом региона
    const cart = await MedusaClient.carts.retrieve(cart_id)

    // создаём PaymentIntent через Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: cart.total,
      currency: cart.region.currency_code,
      automatic_payment_methods: { enabled: true },
    })

    return NextResponse.json({ client_secret: paymentIntent.client_secret })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 }
    )
  }
}
