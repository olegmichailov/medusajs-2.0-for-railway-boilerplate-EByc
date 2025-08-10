// storefront/src/app/[countryCode]/contact/page.tsx
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach us",
}

export default function ContactPage() {
  return (
    <main className="content-container py-16">
      <h1 className="text-2xl font-semibold tracking-wide">Contact</h1>
      <p className="mt-4 text-ui-fg-subtle">
        Reach us at <a className="underline" href="mailto:support@gmorkl.de">support@gmorkl.de</a>
      </p>
    </main>
  )
}
