export default async function sendAdminNotificationHandler({ data, container }) {
  const notificationService = container.resolve('notificationService')
  const orderService = container.resolve('orderService')

  if (!data?.id) {
    console.warn('Order ID not found in event data')
    return
  }

  const order = await orderService.retrieve(data.id, {
    relations: ['items', 'customer'],
  })

  const customerEmail = order?.customer?.email
  if (!customerEmail) {
    console.warn('Customer email not found for order', data.id)
    return
  }

  // Формируем простое письмо админу
  const subject = `Новый заказ №${order.display_id}`
  const text = `
    Новый заказ:
    Номер: ${order.display_id}
    Имя: ${order?.shipping_address?.first_name || ''} ${order?.shipping_address?.last_name || ''}
    Email: ${customerEmail}
    Сумма: ${order.total / 100} ${order.currency_code.toUpperCase()}
  `

  await notificationService.sendEmail('resend', {
    to: 'larvarvar@gmail.com', // <-- сюда приходит уведомление
    subject: subject,
    text: text,
  })
}
