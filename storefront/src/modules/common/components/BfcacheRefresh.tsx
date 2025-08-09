"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * Форсит перерисовку серверных компонентов (включая шапку/сайдбар),
 * когда пользователь возвращается на вкладку или из bfcache после редиректа
 * (Klarna/Revolut и т.п.). Не трогает никакой платежной логики.
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
