import * as React from 'react'
import { Section, Text } from '@react-email/components'

type OrderPlacedAdminTemplateProps = {
  order: any
  shippingAddress: any
}

export const ORDER_PLACED_ADMIN = "order_placed_admin"

export function isOrderPlacedAdminTemplateData(data: any): data is OrderPlacedAdminTemplateProps {
  return data && data.order && data.shippingAddress
}

export function OrderPlacedAdminTemplate({ order, shippingAddress }: OrderPlacedAdminTemplateProps) {
  return (
    <Section style={{ fontFamily: "Arial, sans-serif", fontSize: "15px", lineHeight: "1.5" }}>
      <h2>New Order Notification</h2>
      <p><strong>Customer Email:</strong> {order.email}</p>
      <p><strong>Order ID:</strong> {order.id}</p>
      <p><strong>Shipping Address:</strong></p>
      <p>
        {shippingAddress.first_name} {shippingAddress.last_name}<br />
        {shippingAddress.address_1}<br />
        {shippingAddress.postal_code} {shippingAddress.city}<br />
        {shippingAddress.country_code.toUpperCase()}
      </p>
      <p><strong>Order Items:</strong></p>
      <ul>
        {order.items.map((item: any) => (
          <li key={item.id}>
            {item.title} × {item.quantity}
          </li>
        ))}
      </ul>
      <p><strong>Total:</strong> €{order.summary.total / 100}</p>
    </Section>
  )
}
