export default function OrderPlacedAdminTemplate({ order_id }: { order_id: string }) {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", fontSize: "15px", lineHeight: "1.5" }}>
      <h2>New Order Notification</h2>
      <p><strong>Order ID:</strong> {order_id}</p>
    </div>
  )
}
