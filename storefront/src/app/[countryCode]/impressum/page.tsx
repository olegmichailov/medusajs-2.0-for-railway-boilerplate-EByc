import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Impressum | Gmorkl Store",
  description: "Impressum gemäß § 5 TMG für den Gmorkl Store.",
}

export default function ImpressumPage() {
  return (
    <div className="content-container py-16 sm:py-24 font-sans text-base tracking-wider">
      <h1 className="text-4xl font-[505] uppercase tracking-wider mb-8">Impressum</h1>

      <p className="mb-6">
        Angaben gemäß § 5 TMG:<br />
        Maria Rodigina<br />
        Freischaffende Designerin und Künstlerin<br />
        Simon-Meister-Str. 24<br />
        50733 Köln<br />
        Deutschland
      </p>

      <p className="mb-6">
        Kontakt:<br />
        Telefon: <a href="tel:+491749482074" className="underline hover:text-ui-fg-base">+49 174 9482074</a><br />
        E-Mail: <a href="mailto:weare@gmorkl.de" className="underline hover:text-ui-fg-base">weare@gmorkl.de</a><br />
        Instagram: <a href="https://www.instagram.com/gmorkl/" target="_blank" rel="noopener noreferrer" className="underline hover:text-ui-fg-base">@gmorkl</a>
      </p>

      <p className="mb-6">
        Steuernummer gemäß §27 a Umsatzsteuergesetz:<br />
        217/5243/7479<br />
        <br />
        Aus Gründen der Kleinunternehmerregelung erfolgt die Verrechnung der o.a. Leistung umsatzsteuerfrei.
      </p>

      <p className="mb-6">
        Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV:<br />
        Maria Rodigina<br />
        Simon-Meister-Str. 24<br />
        50733 Köln
      </p>

      <p className="mb-6">
        Plattform der EU-Kommission zur Online-Streitbeilegung:{" "}
        <a
          href="https://ec.europa.eu/consumers/odr/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-ui-fg-base"
        >
          https://ec.europa.eu/consumers/odr/
        </a>
      </p>

      <p>
        Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
      </p>
    </div>
  )
}
