import { Modules } from '@medusajs/framework/utils'
import { INotificationModuleService, IOrderModuleService } from '@medusajs/framework/types'
import { SubscriberArgs, SubscriberConfig } from '@medusajs/framework'
import { EmailTemplates } from '../modules/email-notifications/templates'

export default async function sendAdminNotificationHandler({
  event: { data },
  container,
}: SubscriberArgs<any>) {
  const notificationModuleService: INotificationModuleService = container.resolve(Modules.NOTIFICATION)
  const orderModuleService: IOrderModuleService = container.resolve(Modules.ORDER)

  const order = await orderModuleService.retrieveOrder(data.id, {
    relations: ['items', 'shipping_address', 'summary'],
  })
  const shippingAddress = await (orderModuleService as any).orderAddressService_.retrieve(order.shipping_address.id)

  try {
    await notificationModuleService.createNotifications({
      to: 'larvarvar@gmail.com', // отправляем админу
      channel: 'email',
      template: EmailTemplates.ORDER_PLACED_ADMIN, // <--- тут ставим новый шаблон
      data: {
        emailOptions: {
          replyTo: 'info@example.com',
          subject: `Новый заказ от ${order.email}`,
        },
        order,
        shippingAddress,
        preview: `Новый заказ от ${order.email}`,
      },
    })
  } catch (error) {
    console.error('Ошибка при отправке уведомления админу:', error)
  }
}

export const config: SubscriberConfig = {
  event: 'order.placed',
}
