"use client"

import { Button } from "@medusajs/ui"
import { PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js"
import { useElements, useStripe } from "@stripe/react-stripe-js"
import React, { useState } from "react"
import ErrorMessage from "../error-message"
import Spinner from "@modules/common/icons/spinner"
import { placeOrder } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { isManual, isPaypal, isStripe } from "@lib/constants"

type PaymentButtonProps = {
  cart: HttpTypes.StoreCart
  "data-testid"?: string
}

const PaymentButton = ({ cart, "data-testid": dataTestId = "submit-order-button" }: PaymentButtonProps) => {
  const paymentSession = cart.payment_collection?.payment_sessions?.[0]
  const notReady = !paymentSession

  if (!paymentSession) {
    return (
      <Button size="large" disabled>
        <Spinner />
      </Button>
    )
  }

  switch (true) {
    case isStripe(paymentSession?.provider_id):
      return <StripePaymentButton cart={cart} notReady={notReady} data-testid={dataTestId} />

    case isPaypal(paymentSession?.provider_id):
      return <PayPalPaymentButton cart={cart} notReady={notReady} data-testid={dataTestId} />

    case isManual(paymentSession?.provider_id):
      return <ManualPaymentButton cart={cart} notReady={notReady} data-testid={dataTestId} />

    default:
      return (
        <Button size="large" disabled>
          <Spinner />
        </Button>
      )
  }
}

export default PaymentButton

// ------------------ STRIPE ------------------

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
      .catch((err) => {
        setErrorMessage(err.message)
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  const stripe = useStripe()
  const elements = useElements()

  const onClick = async () => {
    setErrorMessage(null)

    if (notReady) {
      return
    }

    if (!stripe || !elements) {
      setErrorMessage("Stripe is not initialized.")
      return
    }

    setSubmitting(true)

    // ВАЖНО: для redirect-методов Payment Element сам сделает редирект,
    // а после возврата мы автодожмём заказ в payment/index.tsx (см. useEffect там).
    const result = await stripe.confirmPayment({
      elements,
      // Разрешаем редирект только когда требуется (карта не уходит в редирект).
      redirect: "if_required",
      confirmParams: {
        // Возвращаемся на ту же страницу checkout, чтобы сработала автодожимка заказа
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
      // Ошибка верификации 3DS/ошибка метода
      setErrorMessage(error.message || "Payment failed.")
      setSubmitting(false)
      return
    }

    // Карты/Link и т.п. без редиректа
    if (
      paymentIntent &&
      (paymentIntent.status === "succeeded" ||
        paymentIntent.status === "processing" ||
        paymentIntent.status === "requires_capture")
    ) {
      return onPaymentCompleted()
    }

    // Если это redirect-метод — браузер уже ушёл; по возврату auto placeOrder (см. payment/index.tsx)
    setSubmitting(false)
  }

  return (
    <>
      <Button
        onClick={onClick}
        disabled={submitting || notReady}
        size="large"
        data-testid={dataTestId}
      >
        {submitting ? <Spinner /> : "Place order"}
      </Button>
      <ErrorMessage error={errorMessage} data-testid="stripe-payment-error-message" />
    </>
  )
}

// ------------------ PAYPAL (оставляем как было) ------------------

const PayPalPaymentButton = ({
  cart,
  notReady,
  "data-testid": dataTestId,
}: {
  cart: HttpTypes.StoreCart
  notReady: boolean
  "data-testid"?: string
}) => {
  const [{ isPending }] = usePayPalScriptReducer()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  return (
    <>
      <div className="max-w-[420px]">
        <PayPalButtons
          disabled={notReady}
          onError={(err) => setErrorMessage((err as any)?.message || "PayPal error")}
          createOrder={async () => {
            // В твоей архитектуре заказ создаётся при завершении корзины; PayPal-ветку не трогаем.
            return ""
          }}
        />
      </div>
      <ErrorMessage error={isPending ? null : errorMessage} data-testid="paypal-payment-error-message" />
    </>
  )
}

// ------------------ MANUAL ------------------

const ManualPaymentButton = ({
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

  const onClick = async () => {
    setSubmitting(true)
    setErrorMessage(null)

    await placeOrder()
      .catch((err) => {
        setErrorMessage(err.message)
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  return (
    <>
      <Button onClick={onClick} disabled={submitting || notReady} size="large" data-testid={dataTestId}>
        {submitting ? <Spinner /> : "Place order"}
      </Button>
      <ErrorMessage error={errorMessage} data-testid="manual-payment-error-message" />
    </>
  )
}
