import { Metadata } from "next"

export const metadata: Metadata = {
  title: "FAQ | Gmorkl Store",
  description: "Häufig gestellte Fragen zum Gmorkl Store.",
}

export default function FaqPage() {
  return (
    <div className="content-container py-16 sm:py-24 font-sans text-base tracking-wider">
      <h1 className="text-4xl font-[505] uppercase tracking-wider mb-8">
        Häufig gestellte Fragen (FAQ)
      </h1>

      <h2 className="text-lg font-semibold mt-10 mb-2">1. Wie kann ich eine Bestellung aufgeben?</h2>
      <p className="mb-6">
        Wählen Sie ein Produkt aus, legen Sie es in den Warenkorb und folgen Sie dem Bestellprozess über die Kasse. Sie erhalten eine Bestellbestätigung per E-Mail.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">2. Welche Zahlungsmethoden werden akzeptiert?</h2>
      <p className="mb-6">
        Wir akzeptieren Kreditkarte, PayPal, Klarna, Apple Pay, Google Pay sowie Zahlungen über Stripe.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">3. Wie lange dauert der Versand?</h2>
      <p className="mb-6">
        Der Versand innerhalb Deutschlands dauert in der Regel 3–7 Werktage. Internationale Lieferungen können länger dauern.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">4. Kann ich meine Bestellung ändern oder stornieren?</h2>
      <p className="mb-6">
        Bitte kontaktieren Sie uns so schnell wie möglich unter kontakt@gmorkl.de. Änderungen oder Stornierungen sind nur vor dem Versand möglich.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">5. Was mache ich, wenn mein Artikel beschädigt ist?</h2>
      <p className="mb-6">
        Sollte ein Artikel beschädigt bei Ihnen ankommen, kontaktieren Sie uns bitte umgehend mit Fotos des Schadens. Wir kümmern uns um Ersatz oder Rückerstattung.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">6. Gibt es einen physischen Laden?</h2>
      <p className="mb-6">
        Derzeit betreiben wir ausschließlich einen Online-Store. Besuche sind nicht möglich.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">7. Wie kann ich den Kundenservice erreichen?</h2>
      <p>
        Sie erreichen uns jederzeit per E-Mail unter kontakt@gmorkl.de. Wir antworten in der Regel innerhalb von 1–2 Werktagen.
      </p>
    </div>
  )
}
