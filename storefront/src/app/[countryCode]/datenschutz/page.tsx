import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Datenschutz | Gmorkl Store",
  description: "Datenschutzerklärung des Gmorkl Store.",
}

export default function DatenschutzPage() {
  return (
    <div className="content-container py-16 sm:py-24 font-sans text-base tracking-wider">
      <h1 className="text-4xl font-[505] uppercase tracking-wider mb-8">
        Datenschutzerklärung
      </h1>
      <h2 className="text-lg font-semibold mt-10 mb-2">1. Verantwortliche Stelle</h2>
      <p className="mb-6">
        Verantwortlich für die Datenverarbeitung ist:<br />
        Gmorkl Store<br />
        Masha Rodigina<br />
        Beispielstraße 12<br />
        50667 Köln<br />
        kontakt@gmorkl.de
      </p>
      <h2 className="text-lg font-semibold mt-10 mb-2">2. Erhebung und Verarbeitung personenbezogener Daten</h2>
      <p className="mb-6">
        Wir erheben personenbezogene Daten, wenn Sie uns diese im Rahmen Ihrer Bestellung oder bei einer Kontaktaufnahme mitteilen. Die Daten werden ohne Ihre ausdrückliche Einwilligung ausschließlich zur Vertragsabwicklung und Bearbeitung Ihrer Anfragen genutzt.
      </p>
      <h2 className="text-lg font-semibold mt-10 mb-2">3. Weitergabe von Daten</h2>
      <p className="mb-6">
        Eine Weitergabe Ihrer Daten erfolgt nur, soweit dies zur Abwicklung Ihrer Bestellung erforderlich ist (z. B. an Versanddienstleister oder Zahlungsdienstleister).
      </p>
      <h2 className="text-lg font-semibold mt-10 mb-2">4. Speicherung von Zugriffsdaten</h2>
      <p className="mb-6">
        Bei jedem Zugriff auf unsere Webseite werden Nutzungsdaten durch den Internetbrowser übermittelt und in Protokolldateien gespeichert. Diese Daten enthalten z. B. IP-Adresse, Datum und Uhrzeit des Zugriffs.
      </p>
      <h2 className="text-lg font-semibold mt-10 mb-2">5. Verwendung von Cookies</h2>
      <p className="mb-6">
        Um den Besuch unserer Website attraktiv zu gestalten und die Nutzung bestimmter Funktionen zu ermöglichen, verwenden wir Cookies. Sie können Ihren Browser so einstellen, dass Sie über das Setzen von Cookies informiert werden.
      </p>
      <h2 className="text-lg font-semibold mt-10 mb-2">6. Ihre Rechte</h2>
      <p className="mb-6">
        Sie haben ein Recht auf unentgeltliche Auskunft über Ihre gespeicherten Daten sowie ggf. ein Recht auf Berichtigung, Sperrung oder Löschung dieser Daten.
      </p>
      <h2 className="text-lg font-semibold mt-10 mb-2">7. Kontakt für Datenschutzanfragen</h2>
      <p>
        Bei Fragen zur Erhebung, Verarbeitung oder Nutzung Ihrer personenbezogenen Daten, wenden Sie sich bitte an:<br />
        kontakt@gmorkl.de
      </p>
    </div>
  )
}
