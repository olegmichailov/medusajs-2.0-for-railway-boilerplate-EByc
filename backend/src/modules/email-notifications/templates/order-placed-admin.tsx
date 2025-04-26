import * as React from "react"
import { Section, Text } from "@react-email/components"

type OrderPlacedAdminTemplateProps = {
  order: any
  shippingAddress: any
}

export default function OrderPlacedAdminTemplate({ order, shippingAddress }: OrderPlacedAdminTemplateProps) {
  return (
    <Section style={{ fontFamily: "Arial, sans-serif", fontSize: "15px", lineHeight: "1.5" }}>
      <h2>New Order Received</h2>
      <p><strong>Customer Email:</strong> {order.email}</p>
      <p><strong>Order ID:</strong> {order.id}</p>
      <p><strong>Shipping Address:</strong></p>
      <p>
        {shippingAddress.first_name} {shippingAddress.last_name}<br />
        {shippingAddress.address_1}<br />
        {shippingAddress.postal_code} {shippingAddress.city}<br />
        {shippingAddress.country_code.toUpperCase()}
      </p>
      <p><strong>Order Summary:</strong></p>
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
