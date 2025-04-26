import { Modules } from '@medusajs/framework/utils'
import { IOrderModuleService } from '@medusajs/framework/types'
import { SubscriberArgs, SubscriberConfig } from '@medusajs/framework'
import { Resend } from 'resend'

export default async function sendAdminNotificationHandler({
  event: { data },
  container,
}: SubscriberArgs<any>) {
  const orderModuleService: IOrderModuleService = container.resolve(Modules.ORDER)

  const order = await orderModuleService.retrieveOrder(data.id, {
    relations: ['items', 'shipping_address', 'summary'],
  })
  const shippingAddress = await (orderModuleService as any).orderAddressService_.retrieve(order.shipping_address.id)

  try {
    const resend = new Resend(process.env.RESEND_API_KEY!)

    await resend.emails.send({
      from: 'info@example.com',
      to: 'larvarvar@gmail.com',
      subject: `Новый заказ от ${order.email}`,
      html: `
        <h1>Новый заказ #${order.display_id || order.id}</h1>
        <p><strong>Покупатель:</strong> ${order.email}</p>

        <h2>Товары:</h2>
        <ul>
          ${order.items.map((item: any) => `<li>${item.quantity} × ${item.title}</li>`).join('')}
        </ul>

        <h2>Итого:</h2>
        <p><strong>Сумма заказа:</strong> ${(order.summary.total / 100).toFixed(2)} €</p>

        <h2>Адрес доставки:</h2>
        <p>
          ${shippingAddress.first_name} ${shippingAddress.last_name}<br/>
          ${shippingAddress.address_1}<br/>
          ${shippingAddress.city}, ${shippingAddress.postal_code}<br/>
          ${shippingAddress.country_code.toUpperCase()}
        </p>
      `,
    })
  } catch (error) {
    console.error('Ошибка при отправке письма админу:', error)
  }
}

export const config: SubscriberConfig = {
  event: 'order.placed',
}
