import "server-only"
import { cookies } from "next/headers"

/** ===== JWT авторизации (оставляем как было) ===== */
export const getAuthHeaders = (): { authorization: string } | {} => {
  const token = cookies().get("_medusa_jwt")?.value
  if (token) return { authorization: `Bearer ${token}` }
  return {}
}

export const setAuthToken = (token: string) => {
  cookies().set("_medusa_jwt", token, {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  })
}

export const removeAuthToken = () => {
  cookies().set("_medusa_jwt", "", { maxAge: -1 })
}

/** ===== cart_id — ХИРУРГИЧЕСКАЯ ПРАВКА =====
 * Возврат с внешних платёжных страниц — это кросс-сайт редирект.
 * Чтобы кука не «терялась», она должна быть SameSite=None; Secure и с path="/".
 */
export const getCartId = () => {
  return cookies().get("_medusa_cart_id")?.value
}

export const setCartId = (cartId: string) => {
  cookies().set("_medusa_cart_id", cartId, {
    maxAge: 60 * 60 * 24 * 30, // 30 дней (можно вернуть 7, если хочешь)
    httpOnly: true,
    sameSite: "none",          // <-- ключевой фикс
    secure: true,              // SameSite=None требует Secure
    path: "/",                 // доступна на всех маршрутах
  })
}

export const removeCartId = () => {
  cookies().set("_medusa_cart_id", "", {
    maxAge: 0,
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/",
  })
}
