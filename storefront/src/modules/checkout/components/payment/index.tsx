"use client"

import { useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { RadioGroup } from "@headlessui/react"
import ErrorMessage from "@modules/checkout/components/error-message"
import { CheckCircleSolid, CreditCard } from "@medusajs/icons"
import { Button, Container, Heading, Text, Tooltip, clx } from "@medusajs/ui"
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js"

import Divider from "@modules/common/components/divider"
import PaymentContainer from "@modules/checkout/components/payment-container"
import { isStripe as isStripeFunc, paymentInfoMap } from "@lib/constants"
import { StripeContext } from "@modules/checkout/components/payment-wrapper"
import { initiatePaymentSession, placeOrder } from "@lib/data/cart"
import type { HttpTypes } from "@medusajs/types"

type PaymentProps = {
  cart: HttpTypes.StoreCart
  "data-testid"?: string
}

const Payment = ({ cart, "data-testid": dataTestId = "payment-container" }: PaymentProps) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const stripeEnabled = useContext(StripeContext)

  const stripe = useStripe()
  const elements = useElements()

  const paymentSession =
    cart.payment_collection?.payment_sessions?.find((s) => s.status === "pending") ??
    cart.payment_collection?.payment_sessions?.[0]

  const isStripe = isStripeFunc(paymentSession?.provider_id)

  // ---------- ПОСЛЕ РЕДИРЕКТА: автозавершение заказа ----------
  useEffect(() => {
    // Stripe добавляет ?payment_intent_client_secret=... при возврате с редирект-методов
    const clientSecret =
      searchParams.get("payment_intent_client_secret") ||
      searchParams.get("setup_intent_client_secret")

    if (!stripe || !clientSecret) return

    let cancelled = false
    stripe
      .retrievePaymentIntent(clientSecret)
      .then(async ({ paymentIntent, error }) => {
        if (cancelled) return
        if (error) {
          console.error("Stripe retrievePaymentIntent error:", error)
          return
        }
        if (!paymentIntent) return

        if (
          paymentIntent.status === "succeeded" ||
          paymentIntent.status === "processing" ||
          paymentIntent.status === "requires_capture"
        ) {
          try {
            await placeOrder()
          } catch (e: any) {
            console.error("placeOrder after redirect failed:", e)
            setErrorMessage(e?.message || "Failed to complete order after redirect.")
          }
        }
      })
      .catch((e) => console.error(e))

    return () => {
      cancelled = true
    }
  }, [stripe, searchParams])

  // ---------- ИНИЦИАЛИЗАЦИЯ СЕССИИ ОПЛАТЫ ----------
  useEffect(() => {
    if (!cart?.id || !paymentSession) return
    // Если нет client_secret — инициируем сессию платежа на бэке
    if (!paymentSession?.data?.client_secret && isStripe) {
      initiatePaymentSession(cart, {
        provider_id: paymentSession.provider_id!,
      }).catch((e) => {
        console.error("initiatePaymentSession failed:", e)
        setErrorMessage(e?.message || "Failed to initiate payment session.")
      })
    }
  }, [cart?.id, paymentSession, isStripe])

  const description = useMemo(() => {
    const info = paymentInfoMap[paymentSession?.provider_id || ""]
    return info?.description || ""
  }, [paymentSession?.provider_id])

  return (
    <Container className="px-0" data-testid={dataTestId}>
      <div className="flex items-center justify-between">
        <Heading level="h2" className="text-2xl">
          Payment
        </Heading>
      </div>

      <div className="mt-6">
        <div className="bg-ui-bg-subtle rounded-rounded border border-ui-border-base px-5 py-4">
          <RadioGroup value={paymentSession?.provider_id} onChange={() => {}}>
            <RadioGroup.Option value={paymentSession?.provider_id || ""}>
              {({ checked }) => (
                <div
                  className={clx(
                    "flex items-center justify-between rounded-rounded border p-4",
                    checked ? "border-ui-border-interactive" : "border-ui-border-base"
                  )}
                >
                  <div className="flex items-center gap-x-3">
                    <CreditCard className="text-ui-fg-subtle" />
                    <div>
                      <Text className="txt-compact-large-plus">Credit card</Text>
                      {!!description && (
                        <Text className="txt-compact-small text-ui-fg-subtle">
                          {description}
                        </Text>
                      )}
                    </div>
                  </div>
                  {checked && <CheckCircleSolid className="text-ui-fg-interactive" />}
                </div>
              )}
            </RadioGroup.Option>
          </RadioGroup>

          <div className="mt-6">
            {isStripe && stripeEnabled ? (
              <div className="rounded-rounded border border-ui-border-base p-4">
                {/* Сам Stripe Payment Element (кошельки появятся автоматически при настройке в Dashboard) */}
                <PaymentElement />
                <Text className="mt-2 txt-compact-small text-ui-fg-subtle">
                  Another step will appear
                </Text>
              </div>
            ) : (
              <Text className="txt-compact-small text-ui-fg-subtle">
                Payment method UI will appear
              </Text>
            )}
          </div>

          <ErrorMessage error={errorMessage} data-testid="payment-error-message" />
        </div>
      </div>

      <Divider className="mt-8" />
    </Container>
  )
}

export default Payment
