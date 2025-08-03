import { sdk } from "@lib/config"  // assume sdk is an instance of Medusa JS client

/**
 * Retrieve the latest cart by ID.
 */
export async function retrieveCart(cartId: string) {
  if (!cartId) return null
  try {
    const { cart } = await sdk.store.carts.retrieve(cartId)
    return cart
  } catch (error) {
    console.error("Failed to retrieve cart", error)
    return null
  }
}

/**
 * Initialize a payment session for the given cart.
 * If multiple payment providers are available, selects the one specified by provider_id.
 */
export async function initiatePaymentSession(cart: any, options: { provider_id: string; data?: any }) {
  if (!cart?.id) {
    throw new Error("Cart ID is required to initiate payment session")
  }
  // If a payment session is already active, do nothing
  if (cart.payment_collection) {
    return cart
  }
  // Create payment sessions for all available providers in the cart's region
  const result = await sdk.store.carts.createPaymentSessions(cart.id)
  const updatedCart = result.cart || result // depending on SDK response shape
  // If a specific provider_id is provided, and multiple sessions exist, select that session
  if (options.provider_id) {
    try {
      await sdk.store.carts.update(updatedCart.id, {
        payment_session: { provider_id: options.provider_id, data: options.data || {} }
      })
    } catch (err) {
      // In Medusa v1, one would use setPaymentSession. In v2, update with payment_session might select it.
      console.error("Failed to set payment session", err)
    }
  }
  return updatedCart
}

/**
 * Complete the cart and place an order. Returns the created order object.
 */
export async function placeOrder(cartId: string) {
  if (!cartId) {
    throw new Error("Cart ID is required to place order")
  }
  const { type, data } = await sdk.store.carts.complete(cartId)
  if (type === "order") {
    // On success, data will be the order
    return data
  } else {
    throw new Error("Failed to place order")
  }
}
