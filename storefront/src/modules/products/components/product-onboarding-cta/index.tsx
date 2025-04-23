"use client"

import { useEffect, useState } from "react"
import { Button, Container, Text } from "@medusajs/ui"

const ProductOnboardingCta = () => {
  const [isOnboarding, setIsOnboarding] = useState(false)

  useEffect(() => {
    if (typeof document !== "undefined") {
      const cookie = document.cookie
      const match = cookie.match(/_medusa_onboarding=true/)
      if (match) {
        setIsOnboarding(true)
      }
    }
  }, [])

  if (!isOnboarding) return null

  return (
    <Container className="border border-gray-200 p-4 rounded-sm bg-gray-50">
      <Text className="mb-2 text-sm">
        Welcome to your Medusa Store! Start customizing your product pages.
      </Text>
      <Button variant="secondary" onClick={() => alert("Go to onboarding flow")}>
        Customize Store
      </Button>
    </Container>
  )
}

export default ProductOnboardingCta
