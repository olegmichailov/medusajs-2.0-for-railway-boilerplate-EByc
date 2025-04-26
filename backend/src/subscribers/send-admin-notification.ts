import { OrderService } from "@medusajs/medusa"
import { SubscriberArgs } from "@medusajs/utils"

export default async function sendAdminNotificationHandler({
  data,
  container,
}: SubscriberArgs<{
  id: string
}>) {
  const orderService = container.resolve<OrderService>("orderService")
  const notificationService = container.resolve("notificationService")

  const order = await orderService.retrieve(data.id, {
    relations: ["items", "customer", "shipping_address"],
  })

  const email = order.email
  const firstName = order.shipping_address?.first_name || ""
  const lastName = order.shipping_address?.last_name || ""
  const address = order.shipping_address
    ? `${order.shipping_address.address_1}, ${order.shipping_address.postal_code} ${order.shipping_address.city}, ${order.shipping_address.country_code?.toUpperCase()}`
    : "No address"

  const items = order.items
    .map(
      (item) =>
        `${item.quantity} × ${item.title} (${(item.total / 100).toFixed(2)} €)`
    )
    .join("\n")

  const total = (order.total / 100).toFixed(2)
  const shipping = (order.shipping_total / 100).toFixed(2)

  const message = `
New order placed!

Customer: ${firstName} ${lastName}
Email: ${email}
Address: ${address}

Items:
${items}

Shipping: ${shipping} €
Total: ${total} €
  `.trim()

  await notificationService.sendNotification(
    "resend",
    "order-placed",
    {
      to: "weare@gmorkl.de", // ТВОЙ email администратора
      subject: "New Order Received!",
      text: message,
    }
  )
}
