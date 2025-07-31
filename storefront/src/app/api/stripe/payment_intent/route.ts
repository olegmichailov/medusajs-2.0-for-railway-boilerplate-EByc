import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const params: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ["card", "apple_pay", "google_pay"], // будет заменено в Payment Element автоматически
      mode: "payment",
      line_items: body.line_items,
      success_url: body.success_url,
      cancel_url: body.cancel_url,
      currency: body.currency || "eur",
    }

    const session = await stripe.checkout.sessions.create(params)

    return NextResponse.json({ session })
  } catch (error) {
    console.error("Stripe error:", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

