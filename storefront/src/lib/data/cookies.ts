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

/** ===== cart_id — ХИРУРГИЧЕСКИЙ ФИКС =====
 * Кросс-сайтовый возврат из Klarna/Revolut/и др. требует SameSite=None; Secure; path="/".
 * В dev на http://localhost кука с Secure не поставится, поэтому делаем условие.
 */
const isProd = process.env.NODE_ENV === "production"

export const getCartId = () => {
  return cookies().get("_medusa_cart_id")?.value
}

export const setCartId = (cartId: string) => {
  cookies().set("_medusa_cart_id", cartId, {
    maxAge: 60 * 60 * 24 * 30,  // 30 дней
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    path: "/",
  })
}

export const removeCartId = () => {
  cookies().set("_medusa_cart_id", "", {
    maxAge: 0,
    httpOnly: true,
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
    path: "/",
  })
}
