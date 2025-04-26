import { SubscriberArgs } from "@medusajs/medusa"
import { NotificationTypes } from "@medusajs/types"

export default async function sendAdminNotification({
  data,
  container,
}: SubscriberArgs<NotificationTypes.OrderPlacedEventData>) {
  const notificationService = container.resolve("notificationService")

  const adminEmails = [
    "larvarvar@gmail.com",
    "olegmikhailov698@gmail.com"
  ]

  for (const email of adminEmails) {
    await notificationService.sendNotification(
      "resend",
      {
        to: email,
        templateData: {
          subject: "Новый заказ",
          text: `Поступил новый заказ.\n\nEmail клиента: ${data.order.email}\nID заказа: ${data.order.id}\nСумма: ${data.order.total / 100} EUR`
        }
      }
    )
  }
}
