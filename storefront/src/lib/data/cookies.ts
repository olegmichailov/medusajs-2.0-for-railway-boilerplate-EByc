import "server-only"
import { cookies } from "next/headers"

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
    path: "/",
  })
}

export const removeAuthToken = () => {
  cookies().set("_medusa_jwt", "", {
    maxAge: 0,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })
}

/** cart_id — фикс для возвратов с внешних платёжных страниц */
export const getCartId = () => {
  return cookies().get("_medusa_cart_id")?.value
}

export const setCartId = (cartId: string) => {
  cookies().set("_medusa_cart_id", cartId, {
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: "none",   // важно для cross-site редиректов
    secure: true,       // обязательно при SameSite=None
    path: "/",          // видна всему приложению
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
