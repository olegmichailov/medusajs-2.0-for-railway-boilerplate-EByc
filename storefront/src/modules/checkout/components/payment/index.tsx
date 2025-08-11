// storefront/src/modules/checkout/components/payment/index.tsx
"use client"

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
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
import { useStripeSafe } from "@lib/stripe/safe-hooks"

const Payment = ({
  cart,
  availablePaymentMethods,
}: {
  cart: any
  availablePaymentMethods: any[]
}) => {
  const activeSession = cart?.payment_collection?.payment_sessions?.find(
    (s: any) => s.status === "pending"
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

  const choseStripe = isStripeFunc(selectedPaymentMethod)
  const stripeReady = useContext(StripeContext)
  const stripe = useStripeSafe()

  const paidByGiftcard =
    cart?.gift_cards && cart?.gift_cards?.length > 0 && cart?.total === 0

  const paymentReady =
    (activeSession && cart?.shipping_methods?.length !== 0) || paidByGiftcard

  // Показывать радиогруппу только если провайдеров больше одного
  const showProviderPicker = (availablePaymentMethods?.length ?? 0) > 1

  // --- защита от параллельных инициализаций ---
  const initInFlight = useRef(false)
  const safeInitiate = async (provider_id: string) => {
    if (initInFlight.current) return
    try {
      initInFlight.current = true
      await initiatePaymentSession(cart, { provider_id })
    } finally {
      initInFlight.current = false
    }
  }

  // ---- 0) Форсим refresh при возврате из bfcache/фонового режима ----
  useEffect(() => {
    const onPageShow = () => router.refresh()
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh()
    }
    window.addEventListener("pageshow", onPageShow)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.removeEventListener("pageshow", onPageShow)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [router])

  // ---- 1) CANCEL/FAILED с редиректа — чистим query и НЕ завершаем заказ ----
  useEffect(() => {
    const redirectStatus = searchParams.get("redirect_status")
    const wasCanceledOrFailed =
      redirectStatus === "canceled" || redirectStatus === "failed"

    if (wasCanceledOrFailed) {
      const params = new URLSearchParams(searchParams.toString())
      ;[
        "payment_intent",
        "payment_intent_client_secret",
        "setup_intent",
        "setup_intent_client_secret",
        "redirect_status",
      ].forEach((k) => params.delete(k))
      params.set("step", "payment")

      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      router.refresh()
    }
  }, [searchParams, pathname, router])

  // ---- 2) «Сторожок»: пришли с client_secret, но без redirect_status ----
  useEffect(() => {
    const redirectStatus = searchParams.get("redirect_status")
    const clientSecret =
      searchParams.get("payment_intent_client_secret") ||
      searchParams.get("setup_intent_client_secret")

    if (clientSecret && !redirectStatus) {
      const t = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString())
        params.set("redirect_status", "canceled")
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        router.refresh()
      }, 8000)
      return () => clearTimeout(t)
    }
  }, [searchParams, pathname, router])

  // ---- 3) Сброс выбора при СМЕНЕ корзины/набора методов ----
  useEffect(() => {
    const active = cart?.payment_collection?.payment_sessions?.find(
      (s: any) => s.status === "pending"
    )
    setSelectedPaymentMethod(active?.provider_id ?? "")
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart?.id, (availablePaymentMethods || []).map((m) => m.id).join(",")])

  // ---- 4) Если есть активная сессия — подхватываем её как выбранный метод ----
  useEffect(() => {
    if (!selectedPaymentMethod && activeSession?.provider_id) {
      setSelectedPaymentMethod(activeSession.provider_id)
    }
  }, [activeSession?.provider_id, selectedPaymentMethod])

  // ---- 5) Если нет выбора, но методы уже приехали — выбрать первый ----
  useEffect(() => {
    if (!selectedPaymentMethod && (availablePaymentMethods?.length ?? 0) > 0) {
      setSelectedPaymentMethod(availablePaymentMethods[0].id)
    }
  }, [selectedPaymentMethod, availablePaymentMethods])

  // ---- 6) Авто-инициация stripe-сессии (для появления PaymentElement) ----
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!cart) return
      if (!choseStripe) return
      if (activeSession) return
      try {
        await safeInitiate(selectedPaymentMethod)
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to start payment session")
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choseStripe, selectedPaymentMethod, cart?.id])

  // ---- 6.1) Активная сессия должна соответствовать выбранному провайдеру ----
  useEffect(() => {
    if (!cart) return
    if (!choseStripe) return
    if (!selectedPaymentMethod) return
    const activeProv = activeSession?.provider_id
    if (activeProv && activeProv !== selectedPaymentMethod) {
      safeInitiate(selectedPaymentMethod).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choseStripe, selectedPaymentMethod, activeSession?.provider_id, cart?.id])

  // ---- 6.2) «Оздоровление» PI: пересоздаём, если он в неподходящем состоянии ----
  useEffect(() => {
    let cancelled = false
    const heal = async () => {
      try {
        if (!stripe) return
        if (!choseStripe) return
        // client_secret из активной stripe-сессии
        const cs =
          (activeSession?.data && (activeSession.data as any).client_secret) ||
          (cart?.payment_session?.data && (cart.payment_session.data as any).client_secret)
        if (!cs) return

        const { paymentIntent } = await stripe.retrievePaymentIntent(cs)
        if (!paymentIntent || cancelled) return

        // Нельзя повторно подтверждать такие PI — создаём новую сессию
        const bad =
          paymentIntent.status === "requires_capture" ||
          paymentIntent.status === "canceled" ||
          paymentIntent.status === "succeeded"

        if (bad) {
          await safeInitiate(selectedPaymentMethod)
        }
      } catch {
        /* тихо */
      }
    }
    heal()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe, choseStripe, activeSession?.id, selectedPaymentMethod, cart?.id])

  /**
   * ---- 7) Автозавершение после редиректа/без него ----
   * Завершаем ТОЛЬКО при succeeded/processing. requires_capture исключён —
   * финализацию сделает вебхук/бэк.
   */
  useEffect(() => {
    const clientSecret =
      searchParams.get("payment_intent_client_secret") ||
      searchParams.get("setup_intent_client_secret")

    const redirectStatus = searchParams.get("redirect_status")
    const allowAutofinish =
      !redirectStatus || redirectStatus === "succeeded" || redirectStatus === "completed"

    if (!allowAutofinish) return
    if (!stripe || !clientSecret) return

    let cancelled = false
    stripe
      .retrievePaymentIntent(clientSecret)
      .then(async ({ paymentIntent, error }) => {
        if (cancelled) return
        if (error || !paymentIntent) return

        if (
          paymentIntent.status === "succeeded" ||
          paymentIntent.status === "processing"
        ) {
          try {
            await placeOrder()
          } catch (e: any) {
            setError(e?.message || "Failed to complete order after redirect.")
          }
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [stripe, searchParams])

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
      const shouldInputCard = choseStripe && !activeSession

      if (!activeSession) {
        await safeInitiate(selectedPaymentMethod)
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

  // методы могут на мгновение быть пустыми (SSR/рефреш) — считаем это «лоадингом»
  const methodsLoaded = (availablePaymentMethods?.length ?? 0) > 0

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
          {!paidByGiftcard && (
            <>
              {methodsLoaded ? (
                <>
                  {showProviderPicker && (
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
                  )}

                  {choseStripe && stripeReady && (
                    <div className="mt-5 transition-all duration-150 ease-in-out">
                      <Text className="txt-medium-plus text-ui-fg-base mb-1">
                        Enter your payment details:
                      </Text>
                      {/* Внутри — вкладки Card/Klarna/PayPal/Revolut Pay и т.д. */}
                      <PaymentElement options={{ layout: "tabs" }} />
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-4">
                  <Text className="txt-medium text-ui-fg-subtle">
                    Payment methods are loading…
                  </Text>
                  <Button
                    className="mt-3"
                    size="small"
                    variant="secondary"
                    onClick={() => router.refresh()}
                  >
                    Refresh
                  </Button>
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
            disabled={(!selectedPaymentMethod && !paidByGiftcard) || !methodsLoaded}
            data-testid="submit-payment-button"
          >
            {!activeSession && choseStripe
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
            <div className="flex кол flex-col w-1/3">
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
