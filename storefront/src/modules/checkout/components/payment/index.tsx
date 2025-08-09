"use client"

import { useCallback, useContext, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { RadioGroup } from "@headlessui/react"
import ErrorMessage from "@modules/checkout/components/error-message"
import { CheckCircleSolid, CreditCard } from "@medusajs/icons"
import { Button, Container, Heading, Text, clx } from "@medusajs/ui"
import { PaymentElement } from "@stripe/react-stripe-js"

import Divider from "@modules/common/components/divider"
import PaymentContainer from "@modules/checkout/components/payment-container"
import { isStripe as isStripeFunc, paymentInfoMap } from "@lib/constants"
import { StripeContext } from "@modules/checkout/components/payment-wrapper"
import { initiatePaymentSession, placeOrder } from "@lib/data/cart"

// безопасный хук (не падает вне <Elements>)
import { useStripeSafe } from "@lib/stripe/safe-hooks"

const Payment = ({
  cart,
  availablePaymentMethods,
}: {
  cart: any
  availablePaymentMethods: any[]
}) => {
  const activeSession = cart.payment_collection?.payment_sessions?.find(
    (paymentSession: any) => paymentSession.status === "pending"
  )

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(
    activeSession?.provider_id ?? ""
  )

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "payment"

  const isStripe = isStripeFunc(activeSession?.provider_id)
  const stripeReady = useContext(StripeContext)
  const stripe = useStripeSafe()

  const paidByGiftcard =
    cart?.gift_cards && cart?.gift_cards?.length > 0 && cart?.total === 0

  const paymentReady =
    (activeSession && cart?.shipping_methods.length !== 0) || paidByGiftcard

  // МИНИ-ФИКС №1: корректная обработка возврата/отмены/неуспеха редирект-методов
  useEffect(() => {
    const redirectStatus = searchParams.get("redirect_status")
    const clientSecret =
      searchParams.get("payment_intent_client_secret") ||
      searchParams.get("setup_intent_client_secret")

    // Отмена/неуспех на стороне провайдера → вернём на шаг оплаты и очистим хвосты в URL
    if (redirectStatus === "canceled" || redirectStatus === "failed") {
      const params = new URLSearchParams(searchParams.toString())
      ;[
        "payment_intent",
        "payment_intent_client_secret",
        "setup_intent",
        "setup_intent_client_secret",
        "redirect_status",
        "source",
        "state",
      ].forEach((k) => params.delete(k))
      params.set("step", "payment")
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      return
    }

    // Успех/в обработке/требует захвата → дожимаем заказ
    if (!stripe || !clientSecret) return

    let cancelled = false
    stripe
      .retrievePaymentIntent(clientSecret)
      .then(async ({ paymentIntent, error }) => {
        if (cancelled) return
        if (error || !paymentIntent) return

        if (
          paymentIntent.status === "succeeded" ||
          paymentIntent.status === "processing" ||
          paymentIntent.status === "requires_capture"
        ) {
          try {
            await placeOrder()
          } catch (e: any) {
            setError(e?.message || "Failed to complete order after redirect.")
          }
          return
        }

        // Ещё один вариант "отмены/неуспеха" от Stripe
        if (
          paymentIntent.status === "requires_payment_method" ||
          paymentIntent.status === "canceled"
        ) {
          const params = new URLSearchParams(searchParams.toString())
          ;[
            "payment_intent",
            "payment_intent_client_secret",
            "setup_intent",
            "setup_intent_client_secret",
            "redirect_status",
            "source",
            "state",
          ].forEach((k) => params.delete(k))
          params.set("step", "payment")
          router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [stripe, searchParams, pathname, router])

  // МИНИ-ФИКС №1.1: если способ не выбран, а Stripe доступен — подставим его по умолчанию
  useEffect(() => {
    if (!selectedPaymentMethod && Array.isArray(availablePaymentMethods)) {
      const stripePm = availablePaymentMethods.find(
        (m) => m.id === "stripe" || m.provider_id === "stripe"
      )
      if (stripePm) setSelectedPaymentMethod(stripePm.id ?? stripePm.provider_id)
    }
  }, [selectedPaymentMethod, availablePaymentMethods])

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams)
      params.set(name, value)
      return params.toString()
    },
    [searchParams]
  )

  const handleEdit = () => {
    router.push(pathname + "?" + createQueryString("step", "payment"), {
      scroll: false,
    })
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    try {
      const shouldInputCard =
        isStripeFunc(selectedPaymentMethod) && !activeSession

      if (!activeSession) {
        await initiatePaymentSession(cart, {
          provider_id: selectedPaymentMethod,
        })
      }

      if (!shouldInputCard) {
        return router.push(
          pathname + "?" + createQueryString("step", "review"),
          { scroll: false }
        )
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setError(null)
  }, [isOpen])

  return (
    <div className="bg-white">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row text-3xl-regular gap-x-2 items-baseline",
            {
              "opacity-50 pointer-events-none select-none":
                !isOpen && !paymentReady,
            }
          )}
        >
          Payment
          {!isOpen && paymentReady && <CheckCircleSolid />}
        </Heading>
        {!isOpen && paymentReady && (
          <Text>
            <button
              onClick={handleEdit}
              className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
              data-testid="edit-payment-button"
            >
              Edit
            </button>
          </Text>
        )}
      </div>

      <div>
        <div className={isOpen ? "block" : "hidden"}>
          {!paidByGiftcard && !!availablePaymentMethods?.length && (
            <>
              <RadioGroup
                value={selectedPaymentMethod}
                onChange={(value: string) => setSelectedPaymentMethod(value)}
              >
                {availablePaymentMethods
                  .sort((a, b) => (a.provider_id > b.provider_id ? 1 : -1))
                  .map((paymentMethod) => (
                    <PaymentContainer
                      paymentInfoMap={paymentInfoMap}
                      paymentProviderId={paymentMethod.id}
                      key={paymentMethod.id}
                      selectedPaymentOptionId={selectedPaymentMethod}
                    />
                  ))}
              </RadioGroup>

              {/* МИНИ-ФИКС №2: показать все доступные методы сразу */}
              {isStripe && stripeReady && (
                <div className="mt-5 transition-all duration-150 ease-in-out">
                  <Text className="txt-medium-plus text-ui-fg-base mb-1">
                    Enter your payment details:
                  </Text>
                  <PaymentElement options={{ layout: "tabs" }} />
                </div>
              )}
            </>
          )}

          {paidByGiftcard && (
            <div className="flex flex-col w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                Payment method
              </Text>
              <Text
                className="txt-medium text-ui-fg-subtle"
                data-testid="payment-method-summary"
              >
                Gift card
              </Text>
            </div>
          )}

          <ErrorMessage
            error={error}
            data-testid="payment-method-error-message"
          />

          <Button
            size="large"
            className="mt-6"
            onClick={handleSubmit}
            isLoading={isLoading}
            disabled={!selectedPaymentMethod && !paidByGiftcard}
            data-testid="submit-payment-button"
          >
            {!activeSession && isStripeFunc(selectedPaymentMethod)
              ? " Enter payment details"
              : "Continue to review"}
          </Button>
        </div>

        <div className={isOpen ? "hidden" : "block"}>
          {cart && paymentReady && activeSession ? (
            <div className="flex items-start gap-x-1 w-full">
              <div className="flex flex-col w-1/3">
                <Text className="txt-medium-plus text-ui-fg-base mb-1">
                  Payment method
                </Text>
                <Text
                  className="txt-medium text-ui-fg-subtle"
                  data-testid="payment-method-summary"
                >
                  {paymentInfoMap[selectedPaymentMethod]?.title ||
                    selectedPaymentMethod}
                </Text>
              </div>
              <div className="flex flex-col w-1/3">
                <Text className="txt-medium-plus text-ui-fg-base mb-1">
                  Payment details
                </Text>
                <div
                  className="flex gap-2 txt-medium text-ui-fg-subtle items-center"
                  data-testid="payment-details-summary"
                >
                  <Container className="flex items-center h-7 w-fit p-2 bg-ui-button-neutral-hover">
                    <CreditCard />
                  </Container>
                  <Text>Another step will appear</Text>
                </div>
              </div>
            </div>
          ) : paidByGiftcard ? (
            <div className="flex flex-col w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                Payment method
              </Text>
              <Text
                className="txt-medium text-ui-fg-subtle"
                data-testid="payment-method-summary"
              >
                Gift card
              </Text>
            </div>
          ) : null}
        </div>
      </div>

      <Divider className="mt-8" />
    </div>
  )
}

export default Payment
