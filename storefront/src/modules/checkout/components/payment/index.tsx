"use client"

import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { RadioGroup } from "@headlessui/react"

import Divider from "@modules/common/components/divider"
import ErrorMessage from "@modules/checkout/components/error-message"
import PaymentContainer from "@modules/checkout/components/payment-container"

import { Button, Container, Heading, Text, clx } from "@medusajs/ui"
import { CheckCircleSolid, CreditCard } from "@medusajs/icons"

import { PaymentElement, useStripe } from "@stripe/react-stripe-js"

import { StripeContext } from "@modules/checkout/components/payment-wrapper"
import {
  initiatePaymentSession,
  placeOrder,
} from "@lib/data/cart"

import { isStripe as isStripeFunc, paymentInfoMap } from "@lib/constants"

type PaymentProps = {
  cart: any
  availablePaymentMethods: Array<{
    id: string // если у тебя provider_id — замени здесь и ниже
    // provider_id?: string
  }>
}

const Payment: React.FC<PaymentProps> = ({
  cart,
  availablePaymentMethods,
}) => {
  const activeSession = cart.payment_collection?.payment_sessions?.find(
    (s: any) => s.status === "pending"
  )

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // выбранный метод — по умолчанию активная сессия или первый доступный
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>(
    activeSession?.provider_id ?? ""
  )

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "payment"

  // ВАЖНО: isStripe вычисляем по ВЫБРАННОМУ методу, а не по активной сессии
  const isStripe = isStripeFunc(selectedPaymentMethod)

  const stripeReady = useContext(StripeContext)
  const stripe = useStripe()

  const paidByGiftcard =
    cart?.gift_cards && cart?.gift_cards?.length > 0 && cart?.total === 0

  const paymentReady =
    (activeSession && cart?.shipping_methods.length !== 0) || paidByGiftcard

  // если ничего не выбрано — выбрать первый доступный
  useEffect(() => {
    if (
      !selectedPaymentMethod &&
      Array.isArray(availablePaymentMethods) &&
      availablePaymentMethods.length
    ) {
      setSelectedPaymentMethod(availablePaymentMethods[0].id)
    }
  }, [availablePaymentMethods, selectedPaymentMethod])

  // обработка возврата из Stripe APM: успех → placeOrder, иначе — вернём на payment с ошибкой
  useEffect(() => {
    const redirectStatus = searchParams.get("redirect_status")
    const clientSecret =
      searchParams.get("payment_intent_client_secret") ||
      searchParams.get("setup_intent_client_secret")

    if (!stripe || (!redirectStatus && !clientSecret)) return

    let cancelled = false

    const backToPayment = (msg?: string) => {
      if (msg) setError(msg)
      router.replace(
        pathname + "?" + createQueryString("step", "payment"),
        { scroll: false }
      )
    }

    const ok = ["succeeded", "processing", "requires_capture"]

    const run = async () => {
      // Если Stripe добавил redirect_status прямо в URL
      if (redirectStatus) {
        if (ok.includes(redirectStatus)) {
          try {
            await placeOrder()
          } catch (e: any) {
            setError(e?.message || "Failed to complete order.")
          }
        } else {
          backToPayment(
            "Payment was canceled or failed. Try again or choose another method."
          )
        }
        return
      }

      // Если только client_secret
      const { paymentIntent, error } =
        await stripe.retrievePaymentIntent(clientSecret)

      if (cancelled) return

      if (error) {
        backToPayment(error.message)
        return
      }

      const status = paymentIntent?.status
      if (status && ok.includes(status)) {
        try {
          await placeOrder()
        } catch (e: any) {
          setError(e?.message || "Failed to complete order.")
        }
      } else {
        backToPayment(
          "Payment was canceled or failed. Try again or choose another method."
        )
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [stripe, searchParams, pathname]) // router и createQueryString стабильны ниже

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
    setError(null)
    try {
      const wantsStripe = isStripeFunc(selectedPaymentMethod)

      // Если сессии нет — создаём под выбранный метод
      if (!activeSession) {
        await initiatePaymentSession(cart, {
          provider_id: selectedPaymentMethod,
        })
      }

      // Для не-Stripe идём сразу на review
      if (!wantsStripe) {
        return router.push(
          pathname + "?" + createQueryString("step", "review"),
          { scroll: false }
        )
      }

      // Для Stripe остаёмся на шаге оплаты — PaymentElement появится (есть сессия)
      return router.replace(
        pathname + "?" + createQueryString("step", "payment"),
        { scroll: false }
      )
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setError(null)
  }, [isOpen])

  // бренды карт в summary больше не отслеживаем — PaymentElement сам валидирует
  const paymentDetailsText = useMemo(() => {
    if (isStripe) return "Card or local method (via Stripe)"
    return "Another step will appear"
  }, [isStripe])

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
        {/* Открытый шаг оплаты */}
        <div className={isOpen ? "block" : "hidden"}>
          {!paidByGiftcard && (availablePaymentMethods?.length ?? 0) > 0 && (
            <>
              <RadioGroup
                value={selectedPaymentMethod}
                onChange={(value: string) => setSelectedPaymentMethod(value)}
              >
                {availablePaymentMethods
                  .sort((a, b) => (a.id > b.id ? 1 : -1))}
                  {/* если используешь provider_id — поменяй сортировку */}
                  .map((pm) => (
                    <PaymentContainer
                      key={pm.id}
                      paymentInfoMap={paymentInfoMap}
                      paymentProviderId={pm.id}
                      selectedPaymentOptionId={selectedPaymentMethod}
                    />
                  ))}
              </RadioGroup>

              {/* Stripe PaymentElement виден только если выбран Stripe и есть Elements (из Wrapper) и активная сессия */}
              {isStripe && stripeReady && activeSession && (
                <div className="mt-5 transition-all duration-150 ease-in-out">
                  <Text className="txt-medium-plus text-ui-fg-base mb-1">
                    Enter your payment details:
                  </Text>
                  <PaymentElement />
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
              ? "Enter payment details"
              : "Continue to review"}
          </Button>
        </div>

        {/* Свернутый шаг (summary) */}
        <div className={isOpen ? "hidden" : "block"}>
          {cart && paymentReady && (activeSession || paidByGiftcard) ? (
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
                    {paymentInfoMap[selectedPaymentMethod]?.icon || (
                      <CreditCard />
                    )}
                  </Container>
                  <Text>{paymentDetailsText}</Text>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <Divider className="mt-8" />
    </div>
  )
}

export default Payment
