"use client"

import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import Spinner from "@modules/common/icons/spinner"
import { Cart } from "@medusajs/medusa"
import { useStripe } from "@stripe/react-stripe-js"

type PaymentButtonProps = {
  cart: Omit<Cart, "refundable_amount" | "refunded_total">
  countryCode: string
}

const PaymentButton = ({ cart, countryCode }: PaymentButtonProps) => {
  const stripe = useStripe()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const clientSecret = searchParams.get("payment_intent_client_secret")
    const redirectStatus = searchParams.get("redirect_status")
    const paymentIntentId = searchParams.get("payment_intent")

    if (
      !stripe ||
      !clientSecret ||
      !redirectStatus ||
      !paymentIntentId ||
      !cart
    ) {
      return
    }

    const redirectUrl = new URL(
      `/api/capture-payment/${cart.id}`,
      window.location.origin
    )

    redirectUrl.searchParams.set("payment_intent", paymentIntentId)
    redirectUrl.searchParams.set("payment_intent_client_secret", clientSecret)
    redirectUrl.searchParams.set("redirect_status", redirectStatus)
    redirectUrl.searchParams.set("country_code", countryCode)

    router.replace(redirectUrl.toString())
  }, [stripe, searchParams, pathname, cart, router, countryCode])

  return (
    <button
      disabled
      className="w-full flex items-center justify-center bg-gray-900 text-white py-3 rounded-md"
    >
      <Spinner className="animate-spin w-5 h-5 mr-2" />
      Processing payment...
    </button>
  )
}

export default PaymentButton
