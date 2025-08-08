"use client"

import { Button } from "@medusajs/ui"
import { OnApproveActions, OnApproveData } from "@paypal/paypal-js"
import { PayPalButtons, usePayPalScriptReducer } from "@paypal/react-paypal-js"
import { useElements, useStripe, PaymentElement } from "@stripe/react-stripe-js"
import React, { useContext, useState } from "react"
import ErrorMessage from "../error-message"
import Spinner from "@modules/common/icons/spinner"
import { placeOrder } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { isManual, isPaypal, isStripe } from "@lib/constants"
import { StripeContext } from "@modules/checkout/components/payment-wrapper"

type PaymentButtonProps = {
  cart: HttpTypes.StoreCart
  "data-testid": string
}

const PaymentButton: React.FC<PaymentButtonProps> = ({
  cart,
  "data-testid": dataTestId,
}) => {
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

// ----------------- STRIPE PAYMENT ELEMENT (Apple Pay + Google Pay) -----------------
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
  const stripe = useStripe()
  const elements = useElements()

  const onPaymentCompleted = async () => {
    await placeOrder()
      .catch((err) => setErrorMessage(err.message))
      .finally(() => setSubmitting(false))
  }

  const disabled = !stripe || !elements || notReady

  const handlePayment = async () => {
    setSubmitting(true)

    if (!stripe || !elements) {
      setSubmitting(false)
      return
    }

    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required", // Не уводим пользователя, если не нужно
      confirmParams: {
        return_url:
          typeof window !== "undefined"
            ? `${window.location.origin}${window.location.pathname.replace(/\?.*$/, "")}?step=review`
            : undefined,
      },
    })

    if (result.error) {
      const pi = (result.error as any).payment_intent
      if (pi && (pi.status === "requires_capture" || pi.status === "succeeded")) {
        await onPaymentCompleted()
        return
      }
      setErrorMessage(result.error.message || "Payment failed.")
      setSubmitting(false)
      return
    }

    if (
      result.paymentIntent &&
      ["requires_capture", "succeeded", "processing"].includes(result.paymentIntent.status)
    ) {
      await onPaymentCompleted()
      return
    }

    setSubmitting(false)
  }

  return (
    <>
      {/* Сам PaymentElement — внутри формы */}
      <div className="mb-4">
        <PaymentElement options={{ layout: "tabs" }} />
      </div>

      <Button
        disabled={disabled}
        onClick={handlePayment}
        size="large"
        isLoading={submitting}
        data-testid={dataTestId}
      >
        Place order
      </Button>

      <ErrorMessage error={errorMessage} data-testid="stripe-payment-error-message" />
    </>
  )
}

// ----------------- PAYPAL -----------------
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

  const handlePayment = async (_data: OnApproveData, actions: OnApproveActions) => {
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
        <ErrorMessage error={errorMessage} data-testid="paypal-payment-error-message" />
      </>
    )
  }
}

// ----------------- MANUAL TEST -----------------
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
      <ErrorMessage error={errorMessage} data-testid="manual-payment-error-message" />
    </>
  )
}

export default PaymentButton
