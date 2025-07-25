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
        Angaben gemäß § 5 TMG:
        <br />
        Gmorkl Store<br />
        Inhaber: Masha Rodigina<br />
        Beispielstraße 12<br />
        50667 Köln<br />
        Deutschland
      </p>
      <p className="mb-6">
        Kontakt:
        <br />
        Telefon: +49 (0) 123 456789<br />
        E-Mail: kontakt@gmorkl.de
      </p>
      <p className="mb-6">
        Umsatzsteuer-Identifikationsnummer gemäß §27 a Umsatzsteuergesetz:<br />
        DE123456789
      </p>
      <p className="mb-6">
        Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV:<br />
        Masha Rodigina<br />
        Beispielstraße 12<br />
        50667 Köln
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
        Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>
    </div>
  )
}
