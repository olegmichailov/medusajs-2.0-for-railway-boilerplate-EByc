import { EventBusService, NotificationService } from "@medusajs/medusa"
import { EntityManager } from "@mikro-orm/core"

type InjectedDependencies = {
  eventBusService: EventBusService
  notificationService: NotificationService
  manager: EntityManager
}

class SendAdminNotificationSubscriber {
  protected eventBusService_: EventBusService
  protected notificationService_: NotificationService
  protected manager_: EntityManager

  constructor({ eventBusService, notificationService, manager }: InjectedDependencies) {
    this.eventBusService_ = eventBusService
    this.notificationService_ = notificationService
    this.manager_ = manager

    this.eventBusService_.subscribe("order.placed", this.handleOrderPlaced)
  }

  handleOrderPlaced = async (data: { id: string }) => {
    try {
      await this.notificationService_.sendNotification("order_placed_admin", {
        to: "larvarvar@gmail.com", // email администратора
        data: {
          order_id: data.id,
          emailOptions: {
            subject: `Новый заказ #${data.id}`,
          },
        },
      })
    } catch (error) {
      console.error("Не удалось отправить уведомление админу:", error)
    }
  }
}

export default SendAdminNotificationSubscriber
