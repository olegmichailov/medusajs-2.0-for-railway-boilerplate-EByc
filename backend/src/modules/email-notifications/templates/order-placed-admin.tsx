import { ReactElement } from "react"
import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components"

type OrderPlacedAdminTemplateProps = {
  email: string
  orderId: string
  firstName?: string
  lastName?: string
}

export const ORDER_PLACED_ADMIN = "order-placed-admin"

export function isOrderPlacedAdminTemplateData(data: any): data is OrderPlacedAdminTemplateProps {
  return typeof data?.email === "string" && typeof data?.orderId === "string"
}

export const OrderPlacedAdminTemplate = ({
  email,
  orderId,
  firstName,
  lastName,
}: OrderPlacedAdminTemplateProps): ReactElement => {
  return (
    <Html>
      <Head />
      <Preview>New order placed</Preview>
      <Body style={{ backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" }}>
        <Container>
          <Section style={{ marginBottom: "16px" }}>
            <Text>New order has been placed!</Text>
          </Section>
          <Section>
            <Text><strong>Customer:</strong> {firstName || ""} {lastName || ""}</Text>
            <Text><strong>Email:</strong> {email}</Text>
            <Text><strong>Order ID:</strong> {orderId}</Text>
          </Section>
          <Hr />
        </Container>
      </Body>
    </Html>
  )
}
