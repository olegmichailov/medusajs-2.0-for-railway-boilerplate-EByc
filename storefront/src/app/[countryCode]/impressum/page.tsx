import React from "react"

export default function ImpressumPage() {
  return (
    <div className="max-w-3xl mx-auto py-20 px-4 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-semibold mb-8 tracking-wide uppercase">Impressum</h1>
      <div className="space-y-4 text-base leading-relaxed">
        <p>
          Angaben gemäß § 5 TMG
          <br />
          Maria Rodigina <br />
          Gmorkl Store <br />
          ...<br />
          (здесь вставь твои реквизиты, адрес, электронку, телефон — всё, что требует закон)
        </p>
        <p>
          Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV:<br />
          Maria Rodigina
        </p>
        <p>
          Kontakt:<br />
          E-Mail: info@gmorkl.de
        </p>
        <p>
          Haftungsausschluss: Trotz sorgfältiger inhaltlicher Kontrolle übernehmen wir keine Haftung für die Inhalte externer Links. Für den Inhalt der verlinkten Seiten sind ausschließlich deren Betreiber verantwortlich.
        </p>
      </div>
    </div>
  )
}
