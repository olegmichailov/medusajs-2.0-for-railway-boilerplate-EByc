"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * Форсит серверный refresh (перерисовку навигации/счётчика корзины)
 * после возврата со сторонней платёжной страницы или при возврате вкладки из bfcache.
 * Платёжную логику НЕ трогает.
 */
export default function BfcacheRefresh() {
  const router = useRouter()

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

  return null
}
