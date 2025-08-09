"use client"

import React from "react"
import { Elements } from "@stripe/react-stripe-js"
import type { Stripe, StripeElementsOptions } from "@stripe/stripe-js"
import type { HttpTypes } from "@medusajs/types"

/**
 * Пропсы-обёртки для Stripe Elements.
 * - paymentSession: активная сессия оплаты (Stripe PaymentIntent/SetupIntent), внутри которой есть client_secret
 * - stripeKey: публичный ключ (NEXT_PUBLIC_STRIPE_KEY)
 * - stripePromise: результат loadStripe(stripeKey)
 * - children: содержимое, в котором будут использоваться хуки и компоненты Stripe (например, <PaymentElement/>)
 */
type StripeWrapperProps = {
  paymentSession: HttpTypes.StorePaymentSession
  stripeKey?: string
  stripePromise: Promise<Stripe | null> | null
  children: React.ReactNode
}

/**
 * StripeWrapper
 *
 * Монтирует провайдер <Elements> c корректными опциями, основанными на client_secret
 * из PaymentIntent/SetupIntent. Payment Element (и прочие элементы) будут работать только внутри <Elements>.
 *
 * Важно:
 * - Ключ `key={clientSecret}` на <Elements> принудительно пересобирает провайдер,
 *   когда Stripe создаёт НОВУЮ сессию (новый client_secret). Это устраняет "залипание" старого состояния.
 * - Проверки на наличие stripeKey/stripePromise/clientSecret сделаны явными, чтобы не было
 *   тихих падений с непонятными ошибками в консоли.
 */
const StripeWrapper: React.FC<StripeWrapperProps> = (props) => {
  const { paymentSession, stripeKey, stripePromise, children } = props

  // 1) Достаём client_secret из данных сессии
  const clientSecret = paymentSession?.data?.client_secret as string | undefined

  // 2) Готовим опции для Elements. Здесь можно тонко настраивать внешний вид и локаль.
  const options: StripeElementsOptions = {
    clientSecret,
    // Локаль интерфейса Stripe. Можно поставить "de", если хочешь немецкий.
    locale: "en",
    // Оформление — базовая тема Stripe. Можно кастомизировать под бренд позже.
    appearance: {
      theme: "stripe",
      // Пример дополнительной тонкой настройки (оставлено закомментированным для читаемости):
      // variables: { colorPrimary: "#111827" },
    },
  }

  // 3) Явные проверки окружения — если что-то не так, бросаем понятную ошибку.
  if (!stripeKey) {
    throw new Error(
      "Stripe key is missing. Set NEXT_PUBLIC_STRIPE_KEY environment variable."
    )
  }

  if (!stripePromise) {
    throw new Error(
      "Stripe promise is missing. Make sure you have provided a valid Stripe key."
    )
  }

  if (!clientSecret) {
    throw new Error(
      "Stripe client secret is missing. Cannot initialize Stripe."
    )
  }

  // 4) Возвращаем провайдер Elements. Ключ равен clientSecret,
  //    чтобы при его смене провайдер гарантированно пересоздался.
  return (
    <Elements key={clientSecret} options={options} stripe={stripePromise}>
      {children}
    </Elements>
  )
}

export default StripeWrapper
