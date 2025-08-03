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
        Für alle Bestellungen über unseren Online-Shop gelten die nachfolgenden AGB. Unser Online-Shop richtet sich ausschließlich an Verbraucher im Sinne von § 13 BGB.
      </p>
      <h2 className="text-lg font-semibold mt-10 mb-2">2. Vertragspartner</h2>
      <p className="mb-6">
        Der Kaufvertrag kommt zustande mit:<br />
        Maria Rodigina Freischaffende Designerin und Künstlerin<br />
        Simon-Meister-Str. 24<br />
        50733 Köln<br />
        Deutschland
      </p>
      <h2 className="text-lg font-semibold mt-10 mb-2">3. Vertragsschluss</h2>
      <p className="mb-6">
        Die Darstellung der Produkte im Online-Shop stellt kein rechtlich bindendes Angebot, sondern einen unverbindlichen Online-Katalog dar. Durch Anklicken des Bestellbuttons geben Sie eine verbindliche Bestellung ab. Der Vertrag kommt zustande, wenn wir Ihre Bestellung durch eine Auftragsbestätigung per E-Mail unmittelbar nach dem Erhalt Ihrer Bestellung annehmen.
      </p>
      <h2 className="text-lg font-semibold mt-10 mb-2">4. Kleinunternehmerregelung</h2>
      <p className="mb-6">
        Die Abrechnung erfolgt gemäß § 19 UStG ohne Ausweis der Umsatzsteuer (Kleinunternehmerregelung).
      </p>
      <h2 className="text-lg font-semibold mt-10 mb-2">5. Lieferung</h2>
      <p className="mb-6">
        Die Lieferung erfolgt innerhalb Deutschlands und in ausgewählte Länder per DHL, Hermes oder Abholung. Die Lieferzeit beträgt in der Regel 5–7 Werktage. Die Versandkosten sind individuell und richten sich nach dem Zielland.
      </p>
      <h2 className="text-lg font-semibold mt-10 mb-2">6. Bezahlung</h2>
      <p className="mb-6">
        In unserem Shop stehen Ihnen folgende Zahlungsarten zur Verfügung: Kreditkarte (Visa, Mastercard), PayPal, Banküberweisung. Details werden im Bestellprozess genannt.
      </p>
      <h2 className="text-lg font-semibold mt-10 mb-2">7. Widerrufsrecht und Rückgabe</h2>
      <p className="mb-6">
        Verbrauchern steht das gesetzliche Widerrufsrecht zu, wie in der <a href="/widerruf" className="underline">Widerrufsbelehrung</a> ausführlich beschrieben. Rücksendekosten trägt der Käufer. Rückgabeadresse siehe Impressum.
      </p>
      <h2 className="text-lg font-semibold mt-10 mb-2">8. Eigentumsvorbehalt</h2>
      <p className="mb-6">
        Die Ware bleibt bis zur vollständigen Bezahlung unser Eigentum.
      </p>
      <h2 className="text-lg font-semibold mt-10 mb-2">9. Gewährleistung</h2>
      <p className="mb-6">
        Es gilt das gesetzliche Mängelhaftungsrecht.
      </p>
      <h2 className="text-lg font-semibold mt-10 mb-2">10. Streitbeilegung</h2>
      <p className="mb-6">
        Die EU-Kommission stellt eine Plattform zur Online-Streitbeilegung bereit:{" "}
        <a href="https://ec.europa.eu/consumers/odr" className="underline" target="_blank" rel="noopener noreferrer">
          https://ec.europa.eu/consumers/odr
        </a>.
        Zur Teilnahme an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle sind wir nicht verpflichtet und nicht bereit.
      </p>
      <h2 className="text-lg font-semibold mt-10 mb-2">11. Kontakt</h2>
      <p>
        Maria Rodigina Freischaffende Designerin und Künstlerin<br />
        Simon-Meister-Str. 24<br />
        50733 Köln<br />
        weare@gmorkl.de<br />
        Tel.: +49 174 9482074
      </p>
    </div>
  )
}
