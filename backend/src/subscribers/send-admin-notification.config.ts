import { SubscriberConfig } from "@medusajs/medusa"

export const config: SubscriberConfig = {
  event: "order.placed",
  context: {
    subscriberId: "send-admin-notification",
  },
}
