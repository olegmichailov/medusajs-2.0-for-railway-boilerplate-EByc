"use client"

import {
  useStripe as useStripeOriginal,
  useElements as useElementsOriginal,
} from "@stripe/react-stripe-js"

/**
 * Возвращает Stripe instance или null, НО НЕ ПАДАЕТ,
 * даже если компонента рендерится вне <Elements>.
 */
export function useStripeSafe() {
  try {
    return useStripeOriginal()
  } catch (_e) {
    return null
  }
}

/**
 * Возвращает Elements instance или null, НО НЕ ПАДАЕТ,
 * даже если компонента рендерится вне <Elements>.
 */
export function useElementsSafe() {
  try {
    return useElementsOriginal()
  } catch (_e) {
    return null
  }
}
