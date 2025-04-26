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
    relations: ['items', 'shipping_address'],
  })
  const shippingAddress = await (orderModuleService as any).orderAddressService_.retrieve(order.shipping_address.id)

  try {
    await notificationModuleService.createNotifications({
      to: 'larvarvar@gmail.com',
      channel: 'email',
      template: EmailTemplates.ORDER_PLACED, // <<< вот правильный ключ
      data: {
        emailOptions: {
          replyTo: 'info@example.com',
          subject: `Новый заказ от ${order.email}`,
        },
        order: {
          id: order.id,
          email: order.email,
          items: order.items.map((item) => ({
            title: item.title,
            quantity: item.quantity,
          })),
          summary: {
            total: order.total,
          },
        },
        shippingAddress: {
          first_name: shippingAddress.first_name,
          last_name: shippingAddress.last_name,
          address_1: shippingAddress.address_1,
          city: shippingAddress.city,
          postal_code: shippingAddress.postal_code,
          country_code: shippingAddress.country_code,
        },
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
