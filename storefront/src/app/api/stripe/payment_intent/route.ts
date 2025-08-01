// src/app/api/payment_intent/route.ts

import { NextResponse } from "next/server"
import { stripe } from "medusa-payment-stripe"
import { medusaClient } from "@lib/config"

export async function POST(req: Request) {
  try {
    const { cart_id } = await req.json()

    const response = await medusaClient.carts.retrieve(cart_id)
    const cart = response.cart

    if (!cart) {
      return NextResponse.json({ error: "Cart not found" }, { status: 404 })
    }

    const paymentSession = cart.payment_sessions?.find(
      (session) => session.provider_id === "stripe"
    )

    if (!paymentSession?.data?.client_secret) {
      return NextResponse.json({ error: "Stripe session not found" }, { status: 400 })
    }

    return NextResponse.json({ client_secret: paymentSession.data.client_secret })
  } catch (error: any) {
    console.error("Stripe Intent Error:", error)
    return NextResponse.json({ error: error.message || "Unknown error" }, { status: 500 })
  }
}
