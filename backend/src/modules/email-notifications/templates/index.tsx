import * as React from "react"

interface OrderPlacedAdminEmailProps {
  order: {
    id: string
    email: string
    items: { title: string; quantity: number }[]
    summary: { total: number }
  }
  shippingAddress: {
    first_name: string
    last_name: string
    address_1: string
    city: string
    postal_code: string
    country_code: string
  }
}

export const ORDER_PLACED_ADMIN = "order_placed_admin"

export function isOrderPlacedAdminTemplateData(data: any): data is OrderPlacedAdminEmailProps {
  return data && typeof data.order?.id === "string"
}

export const OrderPlacedAdminTemplate = ({
  order,
  shippingAddress,
}: OrderPlacedAdminEmailProps) => {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", fontSize: "16px", color: "#333" }}>
      <h1>Новый заказ #{order.id}</h1>

      <p><strong>Покупатель:</strong> {order.email}</p>

      <h2>Товары:</h2>
      <ul>
        {order.items.map((item, idx) => (
          <li key={idx}>
            {item.quantity} × {item.title}
          </li>
        ))}
      </ul>

      <h2>Итого:</h2>
      <p><strong>Сумма заказа:</strong> {(order.summary.total / 100).toFixed(2)} €</p>

      <h2>Адрес доставки:</h2>
      <p>
        {shippingAddress.first_name} {shippingAddress.last_name}<br />
        {shippingAddress.address_1}<br />
        {shippingAddress.city}, {shippingAddress.postal_code}<br />
        {shippingAddress.country_code.toUpperCase()}
      </p>

      <p>Проверьте и обработайте заказ в админке!</p>
    </div>
  )
}
