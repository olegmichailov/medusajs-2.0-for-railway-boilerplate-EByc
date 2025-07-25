import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Versand & Zahlung | Gmorkl Store",
  description: "Informationen zu Versandkosten, Zahlungsmethoden und Lieferzeiten.",
}

export default function ZahlungPage() {
  return (
    <div className="content-container py-16 sm:py-24 font-sans text-base tracking-wider">
      <h1 className="text-4xl font-[505] uppercase tracking-wider mb-8">
        Versand & Zahlung
      </h1>

      <h2 className="text-lg font-semibold mt-10 mb-2">Zahlungsmethoden</h2>
      <p className="mb-6">
        Wir akzeptieren folgende Zahlungsmethoden:
      </p>
      <ul className="list-disc list-inside mb-6">
        <li>Visa</li>
        <li>MasterCard</li>
        <li>Apple Pay</li>
        <li>Google Pay</li>
        <li>Klarna</li>
        <li>Stripe</li>
        <li>EC-Karte (nur bei lokalen Events)</li>
        <li>PayPal (in ausgewählten Fällen)</li>
      </ul>

      <h2 className="text-lg font-semibold mt-10 mb-2">Versandkosten</h2>
      <p className="mb-6">
        Innerhalb Deutschlands berechnen wir eine Versandpauschale von 4,90 €. Ab einem Bestellwert von 100 € ist der Versand kostenlos.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Lieferzeiten</h2>
      <p className="mb-6">
        Die Lieferzeit beträgt in der Regel 2–5 Werktage innerhalb Deutschlands. Internationale Lieferungen können je nach Zielland zwischen 5–10 Werktagen dauern.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Versanddienstleister</h2>
      <p className="mb-6">
        Wir versenden mit DHL GoGreen und anderen nachhaltigen Partnern.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Verfolgung</h2>
      <p>
        Nach Versand Ihrer Bestellung erhalten Sie eine E-Mail mit einer Sendungsverfolgungsnummer.
      </p>
    </div>
  )
}
