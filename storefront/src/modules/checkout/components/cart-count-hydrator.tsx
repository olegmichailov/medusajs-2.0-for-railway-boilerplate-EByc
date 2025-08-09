"use client"

import { useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

/**
 * Форс-гидратация корзины и серверных компонентов после внешних редиректов (Stripe/Klarna/Revolut).
 * Ничего не рендерит.
 */
export default function CartCountHydrator() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  useEffect(() => {
    // если есть какие-то stripe/klarna параметры — делаем refresh один раз
    const hasStripeParams =
      sp.has("payment_intent") ||
      sp.has("payment_intent_client_secret") ||
      sp.has("setup_intent") ||
      sp.has("setup_intent_client_secret") ||
      sp.has("redirect_status")

    if (hasStripeParams || pathname.includes("/checkout")) {
      // малюсенькая задержка, чтобы не конфликтовать с replace в Payment
      const t = setTimeout(() => router.refresh(), 50)
      return () => clearTimeout(t)
    }
  }, [router, sp, pathname])

  return null
}
