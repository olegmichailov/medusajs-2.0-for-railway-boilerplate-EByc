import React from "react"

export default function ImpressumPage() {
  return (
    <div className="max-w-3xl mx-auto py-20 px-4 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-semibold mb-8 tracking-wide uppercase">Impressum</h1>
      <div className="space-y-4 text-base leading-relaxed">
        <p>
          Angaben gemäß § 5 TMG<br />
          <b>Maria Rodigina</b><br />
          Gmorkl Store<br />
          Sülzgürtel 54<br />
          50937 Köln<br />
          Deutschland
        </p>
        <p>
          Kontakt:<br />
          E-Mail: <a href="mailto:info@gmorkl.de" className="underline">info@gmorkl.de</a>
        </p>
        <p>
          Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV:<br />
          <b>Maria Rodigina</b>
        </p>
        <p>
          Haftungsausschluss:<br />
          Trotz sorgfältiger inhaltlicher Kontrolle übernehmen wir keine Haftung für die Inhalte externer Links.
          Für den Inhalt der verlinkten Seiten sind ausschließlich deren Betreiber verantwortlich.
        </p>
        <p>
          Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz:<br />
          <b>DE352262606</b>
        </p>
      </div>
    </div>
  )
}
