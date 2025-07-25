import { Metadata } from "next"

export const metadata: Metadata = {
  title: "FAQ | Gmorkl Store",
  description: "Frequently asked questions about shipping, returns, payments, and more.",
}

export default function FAQPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 pt-10 pb-20">
      <h1 className="text-4xl font-[505] tracking-wider mb-6 uppercase">FAQ</h1>

      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-semibold mb-2">How long does shipping take?</h2>
          <p>Shipping within Germany typically takes 2–5 business days.</p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">How can I return an item?</h2>
          <p>
            You can return items within 14 days of receipt. For more information, visit the{" "}
            <a href="/en/rueckgabe" className="underline hover:text-ui-fg-base">Returns</a> page.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">What payment methods are accepted?</h2>
          <p>We accept Visa, MasterCard, Apple Pay, Google Pay, Klarna, and Stripe.</p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">Can I change my order afterward?</h2>
          <p>Please contact us as soon as possible by email. We will check if a change is still possible.</p>
        </div>
      </div>
    </div>
  )
}
