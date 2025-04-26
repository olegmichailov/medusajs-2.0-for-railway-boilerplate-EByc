import { EntityManager } from "@mikro-orm/postgresql"
import { EventBusService, OrderService } from "@medusajs/medusa"
import { NotificationService } from "@medusajs/notification"

export default async function sendAdminNotificationHandler({
  data,
  eventName,
  container,
}: {
  data: { id: string }
  eventName: string
  container: {
    manager: EntityManager
    orderService: OrderService
    eventBusService: EventBusService
    notificationService: NotificationService
  }
}) {
  const { id } = data

  const orderService = container.orderService
  const notificationService = container.notificationService

  const order = await orderService.retrieve(id, {
    relations: ["customer", "items"],
  })

  await notificationService.sendNotification("resend", {
    to: "larvarvar@gmail.com", // сюда отправляем админу
    subject: `New order placed: ${order.display_id}`,
    html: `
      <h1>New Order Received</h1>
      <p><strong>Order ID:</strong> ${order.display_id}</p>
      <p><strong>Customer email:</strong> ${order.email}</p>
      <p><strong>Total:</strong> €${(order.total / 100).toFixed(2)}</p>
    `,
  })
}
