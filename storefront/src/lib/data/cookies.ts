import "server-only"
import { cookies } from "next/headers"

/** ===== JWT авторизации (как было) ===== */
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

/** ===== cart_id: SameSite=None; Secure; path="/" ===== */
export const getCartId = () => {
  return cookies().get("_medusa_cart_id")?.value
}

export const setCartId = (cartId: string) => {
  cookies().set("_medusa_cart_id", cartId, {
    maxAge: 60 * 60 * 24 * 30, // 30 дней
    httpOnly: true,
    sameSite: "none",          // ключевой фикс для внешних редиректов
    secure: true,              // требуется при SameSite=None
    path: "/",                 // доступна везде
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

/**
 * Обновляет (переписывает) cart-cookie с корректными атрибутами,
 * даже если она была установлена ранее с другими настройками.
 */
export const touchCartCookie = () => {
  const id = getCartId()
  if (id) {
    setCartId(id) // перепишем с нужными атрибутами
  }
}
