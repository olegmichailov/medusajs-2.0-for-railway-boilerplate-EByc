"use client"

import { Button } from "@medusajs/ui"
import { OnApproveActions, OnApproveData } from "@paypal/paypal-js"
import { PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js"
import React, { useContext, useState, useEffect } from "react"
import ErrorMessage from "../error-message"
import Spinner from "@modules/common/icons/spinner"
import { placeOrder } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { isManual, isPaypal, isStripe } from "@lib/constants"
import { StripeContext } from "@modules/checkout/components/payment-wrapper"
import { usePathname, useSearchParams } from "next/navigation"
import { useStripeSafe, useElementsSafe } from "@lib/stripe/safe-hooks"

type PaymentButtonProps = {
  cart: HttpTypes.StoreCart
  "data-testid": string
}

const PaymentButton: React.FC<PaymentButtonProps> = ({
  cart,
  "data-testid": dataTestId,
}) => {
  const path = usePathname()
  const onCheckoutPage = !!path?.includes("/checkout")
  if (!onCheckoutPage) return null

  const notReady =
    !cart ||
    !cart.shipping_address ||
    !cart.billing_address ||
    !cart.email ||
    (cart.shipping_methods?.length ?? 0) < 1

  const paymentSession = cart.payment_collection?.payment_sessions?.[0]
  const stripeEnabled = useContext(StripeContext)

  switch (true) {
    case isStripe(paymentSession?.provider_id) && stripeEnabled:
      return (
        <StripePaymentButton
          notReady={notReady}
          cart={cart}
          data-testid={dataTestId}
        />
      )
    case isManual(paymentSession?.provider_id):
      return (
        <ManualTestPaymentButton notReady={notReady} data-testid={dataTestId} />
      )
    case isPaypal(paymentSession?.provider_id):
      return (
        <PayPalPaymentButton
          notReady={notReady}
          cart={cart}
          data-testid={dataTestId}
        />
      )
    default:
      return (
        <Button disabled size="large">
          Select a payment method
        </Button>
      )
  }
}

const StripePaymentButton = ({
  cart,
  notReady,
  "data-testid": dataTestId,
}: {
  cart: HttpTypes.StoreCart
  notReady: boolean
  "data-testid"?: string
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const onPaymentCompleted = async () => {
    await placeOrder()
      .catch((err) => setErrorMessage(err.message))
      .finally(() => setSubmitting(false))
  }

  const stripe = useStripeSafe()
  const elements = useElementsSafe()
  const searchParams = useSearchParams()

  const disabled = !stripe || !elements || notReady

  // Вспомогательный чекер статуса PI по client_secret из сессии
  const checkPiAndCompleteIfDone = async (): Promise<boolean> => {
    try {
      const clientSecret =
        (cart as any)?.payment_collection?.payment_sessions?.[0]?.data
          ?.client_secret as string | undefined

      if (!stripe || !clientSecret) return false

      const { paymentIntent, error } = await stripe.retrievePaymentIntent(
        clientSecret
      )
      if (error || !paymentIntent) return false

      if (
        paymentIntent.status === "succeeded" ||
        paymentIntent.status === "processing"
      ) {
        await onPaymentCompleted()
        return true
      }
    } catch {
      // игнор
    }
    return false
  }

  // Автодовершение заказа после возврата с редиректа (Klarna/Revolut и т.п.)
  // Берём client_secret из query (?payment_intent_client_secret=...)
  // и завершаем заказ, если Intent уже succeeded/processing.
  useEffect(() => {
    if (!stripe) return

    const clientSecret =
      searchParams.get("payment_intent_client_secret") ||
      searchParams.get("setup_intent_client_secret")

    if (!clientSecret) return

    const redirectStatus = searchParams.get("redirect_status")
    if (
      redirectStatus &&
      !["succeeded", "completed", "processing"].includes(redirectStatus)
    ) {
      // canceled/failed — не завершаем
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const { paymentIntent } = await stripe.retrievePaymentIntent(
          clientSecret
        )
        if (cancelled || !paymentIntent) return
        if (
          paymentIntent.status === "succeeded" ||
          paymentIntent.status === "processing"
        ) {
          setSubmitting(true)
          await onPaymentCompleted()
        }
      } catch {
        /* молча остаёмся на кнопке */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [stripe, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePayment = async () => {
    setSubmitting(true)

    if (!stripe || !elements || !cart) {
      setSubmitting(false)
      return
    }

    // 1) Если PI уже завершён (например, Link/Wallet подтвердил мгновенно),
    // просто закрываем заказ, не шлём повторный confirm (во избежание 400).
    const alreadyDone = await checkPiAndCompleteIfDone()
    if (alreadyDone) return

    // 2) Обычный путь подтверждения
    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url:
          typeof window !== "undefined"
            ? window.location.origin +
              window.location.pathname.replace(/\?.*$/, "") +
              "?step=review"
            : undefined,
      },
    })

    const { error, paymentIntent } = result

    if (error) {
      // Иногда Stripe даёт 400 и не кладёт PI в error,
      // подстрахуемся ручным чтением и дособерём заказ, если уже всё ок.
      const doneNow = await checkPiAndCompleteIfDone()
      if (doneNow) return

      // Если всё ещё не ок — покажем ошибку
      setErrorMessage(error.message || null)
      setSubmitting(false)
      return
    }

    if (
      paymentIntent &&
      (paymentIntent.status === "succeeded" ||
        paymentIntent.status === "processing")
    ) {
      await onPaymentCompleted()
      return
    }

    setSubmitting(false)
  }

  return (
    <>
      <Button
        disabled={disabled}
        onClick={handlePayment}
        size="large"
        isLoading={submitting}
        data-testid={dataTestId}
      >
        Place order
      </Button>
      <ErrorMessage
        error={errorMessage}
        data-testid="stripe-payment-error-message"
      />
    </>
  )
}

const PayPalPaymentButton = ({
  cart,
  notReady,
  "data-testid": dataTestId,
}: {
  cart: HttpTypes.StoreCart
  notReady: boolean
  "data-testid"?: string
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const onPaymentCompleted = async () => {
    await placeOrder()
      .catch((err) => setErrorMessage(err.message))
      .finally(() => setSubmitting(false))
  }

  const session = cart.payment_collection?.payment_sessions?.find(
    (s) => s.status === "pending"
  )

  const handlePayment = async (
    _data: OnApproveData,
    actions: OnApproveActions
  ) => {
    actions?.order
      ?.authorize()
      .then((authorization) => {
        if (authorization.status !== "COMPLETED") {
          setErrorMessage(`An error occurred, status: ${authorization.status}`)
          return
        }
        onPaymentCompleted()
      })
      .catch(() => {
        setErrorMessage(`An unknown error occurred, please try again.`)
        setSubmitting(false)
      })
  }

  const [{ isPending, isResolved }] = usePayPalScriptReducer()

  if (isPending) return <Spinner />

  if (isResolved) {
    return (
      <>
        <PayPalButtons
          style={{ layout: "horizontal" }}
          createOrder={async () => session?.data.id as string}
          onApprove={handlePayment}
          disabled={notReady || submitting || isPending}
          data-testid={dataTestId}
        />
        <ErrorMessage
          error={errorMessage}
          data-testid="paypal-payment-error-message"
        />
      </>
    )
  }
}

const ManualTestPaymentButton = ({ notReady }: { notReady: boolean }) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const onPaymentCompleted = async () => {
    await placeOrder()
      .catch((err) => setErrorMessage(err.message))
      .finally(() => setSubmitting(false))
  }

  const handlePayment = () => {
    setSubmitting(true)
    onPaymentCompleted()
  }

  return (
    <>
      <Button
        disabled={notReady}
        isLoading={submitting}
        onClick={handlePayment}
        size="large"
        data-testid="submit-order-button"
      >
        Place order
      </Button>
      <ErrorMessage
        error={errorMessage}
        data-testid="manual-payment-error-message"
      />
    </>
  )
}

export default PaymentButton
