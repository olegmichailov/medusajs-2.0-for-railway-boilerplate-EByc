import { OrderPlacedAdminTemplate, ORDER_PLACED_ADMIN, isOrderPlacedAdminTemplateData } from './order-placed-admin'

export const EmailTemplates = {
  INVITE_USER,
  ORDER_PLACED,
  ORDER_PLACED_ADMIN,
} as const

export function generateEmailTemplate(templateKey: string, data: unknown): ReactNode {
  switch (templateKey) {
    case EmailTemplates.INVITE_USER:
      if (!isInviteUserData(data)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Invalid data for template "${EmailTemplates.INVITE_USER}"`
        )
      }
      return <InviteUserEmail {...data} />

    case EmailTemplates.ORDER_PLACED:
      if (!isOrderPlacedTemplateData(data)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Invalid data for template "${EmailTemplates.ORDER_PLACED}"`
        )
      }
      return <OrderPlacedTemplate {...data} />

    case EmailTemplates.ORDER_PLACED_ADMIN:
      if (!isOrderPlacedAdminTemplateData(data)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Invalid data for template "${EmailTemplates.ORDER_PLACED_ADMIN}"`
        )
      }
      return <OrderPlacedAdminTemplate {...data} />

    default:
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unknown template key: "${templateKey}"`
      )
  }
}
