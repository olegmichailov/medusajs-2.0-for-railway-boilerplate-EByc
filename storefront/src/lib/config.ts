// storefront/src/lib/config.ts

import Medusa from "@medusajs/js-sdk";

let MEDUSA_BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000";
const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY!;

const baseSdk = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
  publishableKey: publishableKey,
});

export const sdk = {
  ...baseSdk,
  store: {
    ...baseSdk.store,
    cart: {
      ...baseSdk.store.cart,
      createPaymentSessions: async (cartId: string) => {
        // ВОТ КАК БЫЛО (без body/context)
        return fetch(`${MEDUSA_BACKEND_URL}/store/carts/${cartId}/payment-sessions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-publishable-api-key": publishableKey, // обязательно
          },
        }).then((res) => {
          if (!res.ok) {
            throw new Error("Failed to create payment sessions");
          }
          return res.json();
        });
      },
    },
  },
};
