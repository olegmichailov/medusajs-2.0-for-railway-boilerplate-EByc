import Medusa from "@medusajs/js-sdk"

let MEDUSA_BACKEND_URL = "http://localhost:9000"

if (process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL) {
  MEDUSA_BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
}

const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY!

const baseSdk = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
  publishableKey: publishableKey,
})

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
            "x-publishable-api-key": publishableKey, // <-- ЭТО ОБЯЗАТЕЛЬНО
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
