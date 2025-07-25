import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Datenschutz | Gmorkl Store",
  description: "Datenschutzerklärung gemäß DSGVO für den Gmorkl Store.",
}

export default function DatenschutzPage() {
  return (
    <div className="content-container py-16 sm:py-24 font-sans text-base tracking-wider">
      <h1 className="text-4xl font-[505] uppercase tracking-wider mb-8">Datenschutz</h1>

      <p className="mb-6">
        Verantwortlich für die Datenverarbeitung:<br />
        Masha Rodigina<br />
        Beispielstraße 12<br />
        50667 Köln<br />
        kontakt@gmorkl.de
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Erhebung und Verarbeitung personenbezogener Daten</h2>
      <p className="mb-6">
        Beim Besuch dieser Website werden automatisch technische Daten erfasst (z. B. IP-Adresse, Browsertyp,
        Uhrzeit des Zugriffs). Weitere personenbezogene Daten (z. B. Name, Adresse, E-Mail) werden nur erfasst,
        wenn Sie uns diese aktiv mitteilen, z. B. beim Kauf oder bei einer Anfrage.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Zweck der Datenverarbeitung</h2>
      <p className="mb-6">
        Ihre Daten werden ausschließlich zur Abwicklung von Bestellungen, zur Lieferung sowie zur Abrechnung verwendet.
        Eine Weitergabe an Dritte erfolgt nur, soweit dies zur Vertragserfüllung notwendig ist (z. B. Versanddienstleister,
        Zahlungsanbieter).
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Rechtsgrundlage</h2>
      <p className="mb-6">
        Die Datenverarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Cookies & Tracking</h2>
      <p className="mb-6">
        Diese Website verwendet nur technisch notwendige Cookies. Es werden keine Tracking- oder Analyse-Tools von
        Drittanbietern (wie Google Analytics) eingesetzt.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Ihre Rechte</h2>
      <p className="mb-6">
        Sie haben das Recht auf Auskunft über Ihre gespeicherten Daten sowie das Recht auf Berichtigung, Löschung,
        Einschränkung der Verarbeitung und Datenübertragbarkeit. Bitte wenden Sie sich bei Fragen an:
        kontakt@gmorkl.de
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Beschwerderecht</h2>
      <p>
        Sie haben das Recht, sich bei einer Aufsichtsbehörde zu beschweren, wenn Sie der Meinung sind, dass die
        Verarbeitung Ihrer personenbezogenen Daten nicht rechtmäßig erfolgt.
      </p>
    </div>
  )
}
