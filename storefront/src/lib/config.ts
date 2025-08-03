import Medusa from "@medusajs/js-sdk"

// Defaults to standard port for Medusa server
let MEDUSA_BACKEND_URL = "http://localhost:9000"

if (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) {
  MEDUSA_BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
}

const baseSdk = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
  publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
})

// Расширяем функциональность: вручную добавляем метод createPaymentSessions
export const sdk = {
  ...baseSdk,
  store: {
    ...baseSdk.store,
    cart: {
      ...baseSdk.store.cart,
      createPaymentSessions: async (cartId: string) => {
        return fetch(`${MEDUSA_BACKEND_URL}/store/carts/${cartId}/payment-sessions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }).then((res) => {
          if (!res.ok) {
            throw new Error("Failed to create payment sessions")
          }
          return res.json()
        })
      },
    },
  },
}
