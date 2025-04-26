import { Modules } from '@medusajs/framework/utils'
import { INotificationModuleService, IOrderModuleService } from '@medusajs/framework/types'
import { SubscriberArgs, SubscriberConfig } from '@medusajs/medusa'
import { EmailTemplates } from '../modules/email-notifications/templates'

export default async function sendAdminNotificationHandler({
  event: { data },
  container,
}: SubscriberArgs<any>) {
  const notificationModuleService: INotificationModuleService = container.resolve(Modules.NOTIFICATION)
  const orderModuleService: IOrderModuleService = container.resolve(Modules.ORDER)

  const order = await orderModuleService.retrieveOrder(data.id, { relations: ['items', 'summary', 'shipping_address'] })

  try {
    await notificationModuleService.createNotifications({
      to: "larvarvar@gmail.com", // email администратора
      channel: 'email',
      template: EmailTemplates.ORDER_PLACED_ADMIN,
      data: {
        emailOptions: {
          replyTo: 'info@example.com',
          subject: `Новый заказ №${order.display_id}`,
        },
        order,
        preview: `Новый заказ от ${order.email}`
      }
    })
  } catch (error) {
    console.error('Ошибка при отправке уведомления админу:', error)
  }
}

export const config: SubscriberConfig = {
  event: 'order.placed',
}
