import { Metadata } from "next"

export const metadata: Metadata = {
  title: "AGB | Gmorkl Store",
  description: "Allgemeine Geschäftsbedingungen des Gmorkl Store.",
}

export default function AgbPage() {
  return (
    <div className="content-container py-16 sm:py-24 font-sans text-base tracking-wider">
      <h1 className="text-4xl font-[505] uppercase tracking-wider mb-8">
        Allgemeine Geschäftsbedingungen (AGB)
      </h1>

      <h2 className="text-lg font-semibold mt-10 mb-2">1. Geltungsbereich</h2>
      <p className="mb-6">
        Für alle Bestellungen über unseren Online-Shop gelten die nachfolgenden AGB. Unser Online-Shop richtet sich ausschließlich an Verbraucher.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">2. Vertragspartner</h2>
      <p className="mb-6">
        Der Kaufvertrag kommt zustande mit Gmorkl Store, Masha Rodigina, Beispielstraße 12, 50667 Köln.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">3. Vertragsschluss</h2>
      <p className="mb-6">
        Die Darstellung der Produkte im Online-Shop stellt kein rechtlich bindendes Angebot, sondern einen unverbindlichen Online-Katalog dar. Durch Anklicken des Bestellbuttons geben Sie eine verbindliche Bestellung ab.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">4. Lieferung</h2>
      <p className="mb-6">
        Die Lieferung erfolgt innerhalb Deutschlands und in ausgewählte Länder. Die Lieferzeit beträgt in der Regel 3–7 Werktage.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">5. Bezahlung</h2>
      <p className="mb-6">
        In unserem Shop stehen Ihnen grundsätzlich die folgenden Zahlungsarten zur Verfügung: Kreditkarte, PayPal, Klarna, Apple Pay, Google Pay, Stripe.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">6. Widerrufsrecht</h2>
      <p className="mb-6">
        Verbrauchern steht das gesetzliche Widerrufsrecht zu, wie in der separaten Widerrufsbelehrung beschrieben.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">7. Eigentumsvorbehalt</h2>
      <p className="mb-6">
        Die Ware bleibt bis zur vollständigen Bezahlung unser Eigentum.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">8. Gewährleistung</h2>
      <p className="mb-6">
        Es gilt das gesetzliche Mängelhaftungsrecht.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">9. Streitbeilegung</h2>
      <p className="mb-6">
        Die EU-Kommission stellt eine Plattform zur Online-Streitbeilegung bereit: <a href="https://ec.europa.eu/consumers/odr" className="underline" target="_blank" rel="noopener noreferrer">https://ec.europa.eu/consumers/odr</a>.
        Zur Teilnahme an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle sind wir nicht verpflichtet und nicht bereit.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">10. Kontakt</h2>
      <p>
        Gmorkl Store<br />
        Masha Rodigina<br />
        Beispielstraße 12<br />
        50667 Köln<br />
        kontakt@gmorkl.de
      </p>
    </div>
  )
}
