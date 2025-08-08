import type { Metadata } from "next"
import React from "react"
import StripeElementsProvider from "@modules/common/providers/stripe-elements-provider"

export const metadata: Metadata = {
  title: "GMORKL Store",
  description: "Storefront",
}

export default function CountryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body>
        {/* Глобальный Stripe Elements-контекст для всех страниц локали */}
        <StripeElementsProvider>{children}</StripeElementsProvider>
      </body>
    </html>
  )
}
