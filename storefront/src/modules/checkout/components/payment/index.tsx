"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { RadioGroup } from "@headlessui/react"
import { CheckCircleSolid, CreditCard } from "@medusajs/icons"
import { Button, Container, Heading, Text, clx } from "@medusajs/ui"
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"

import Divider from "@modules/common/components/divider"
import PaymentContainer from "@modules/checkout/components/payment-container"
import { isStripe as isStripeFunc, paymentInfoMap } from "@lib/constants"
import { initiatePaymentSession } from "@lib/data/cart"
import ErrorMessage from "@modules/checkout/components/error-message"

const Payment = ({
  cart,
  availablePaymentMethods,
}: {
  cart: any
  availablePaymentMethods: any[]
}) => {
  const activeSession = cart.payment_collection?.payment_sessions?.find(
    (s: any) => s.status === "pending"
  )

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(
    activeSession?.provider_id ?? ""
  )

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "payment"
  const isStripe = isStripeFunc(selectedPaymentMethod)

  const stripe = useStripe()
  const elements = useElements()

  const paidByGiftcard = cart?.gift_cards?.length > 0 && cart?.total === 0
  const paymentReady = (activeSession && cart?.shipping_methods?.length > 0) || paidByGiftcard

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams)
      params.set(name, value)
      return params.toString()
    },
    [searchParams]
  )

  const handleEdit = () => {
    router.push(pathname + "?" + createQueryString("step", "payment"), {
      scroll: false,
    })
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const shouldCreate = !activeSession

      if (shouldCreate) {
        await initiatePaymentSession(cart, {
          provider_id: selectedPaymentMethod,
        })
      }

      if (isStripe && stripe && elements) {
        const { error: stripeError } = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: `${window.location.origin}${pathname}?${createQueryString("step", "review")}`,
          },
          redirect: "if_required",
        })

        if (stripeError) {
          throw new Error(stripeError.message)
        }

        router.push(pathname + "?" + createQueryString("step", "review"), {
          scroll: false,
        })
      } else {
        router.push(pathname + "?" + createQueryString("step", "review"), {
          scroll: false,
        })
      }
    } catch (err: any) {
      setError(err.message || "Payment failed. Try another method.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setError(null)
  }, [isOpen])

  return (
    <div className="bg-white">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row text-3xl-regular gap-x-2 items-baseline",
            {
              "opacity-50 pointer-events-none select-none":
                !isOpen && !paymentReady,
            }
          )}
        >
          Payment
          {!isOpen && paymentReady && <CheckCircleSolid />}
        </Heading>
        {!isOpen && paymentReady && (
          <Text>
            <button
              onClick={handleEdit}
              className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
            >
              Edit
            </button>
          </Text>
        )}
      </div>

      <div>
        {isOpen ? (
          <>
            {!paidByGiftcard && availablePaymentMethods?.length > 0 && (
              <>
                <RadioGroup
                  value={selectedPaymentMethod}
                  onChange={(value: string) => setSelectedPaymentMethod(value)}
                >
                  {availablePaymentMethods
                    .sort((a, b) => (a.provider_id > b.provider_id ? 1 : -1))
                    .map((pm) => (
                      <PaymentContainer
                        key={pm.id}
                        paymentInfoMap={paymentInfoMap}
                        paymentProviderId={pm.id}
                        selectedPaymentOptionId={selectedPaymentMethod}
                      />
                    ))}
                </RadioGroup>

                {isStripe && stripe && elements && (
                  <div className="mt-6">
                    <Text className="txt-medium-plus text-ui-fg-base mb-2">
                      Choose payment method:
                    </Text>
                    <div className="border rounded-md p-4">
                      <PaymentElement />
                    </div>
                  </div>
                )}
              </>
            )}

            {paidByGiftcard && (
              <div className="flex flex-col w-1/3">
                <Text className="txt-medium-plus text-ui-fg-base mb-1">
                  Payment method
                </Text>
                <Text className="txt-medium text-ui-fg-subtle">
                  Gift card
                </Text>
              </div>
            )}

            <ErrorMessage error={error} />

            <Button
              size="large"
              className="mt-6"
              onClick={handleSubmit}
              isLoading={isLoading}
              disabled={!selectedPaymentMethod || (isStripe && (!stripe || !elements))}
            >
              Continue to review
            </Button>
          </>
        ) : (
          <>
            {paymentReady && activeSession ? (
              <div className="flex items-start gap-x-1 w-full">
                <div className="flex flex-col w-1/3">
                  <Text className="txt-medium-plus text-ui-fg-base mb-1">
                    Payment method
                  </Text>
                  <Text className="txt-medium text-ui-fg-subtle">
                    {paymentInfoMap[selectedPaymentMethod]?.title || selectedPaymentMethod}
                  </Text>
                </div>
                <div className="flex flex-col w-1/3">
                  <Text className="txt-medium-plus text-ui-fg-base mb-1">
                    Payment details
                  </Text>
                  <div className="flex gap-2 txt-medium text-ui-fg-subtle items-center">
                    <Container className="flex items-center h-7 w-fit p-2 bg-ui-button-neutral-hover">
                      {paymentInfoMap[selectedPaymentMethod]?.icon || <CreditCard />}
                    </Container>
                    <Text>Confirmed via Stripe</Text>
                  </div>
                </div>
              </div>
            ) : paidByGiftcard ? (
              <div className="flex flex-col w-1/3">
                <Text className="txt-medium-plus text-ui-fg-base mb-1">
                  Payment method
                </Text>
                <Text className="txt-medium text-ui-fg-subtle">
                  Gift card
                </Text>
              </div>
            ) : null}
          </>
        )}
      </div>

      <Divider className="mt-8" />
    </div>
  )
}

export default Payment
