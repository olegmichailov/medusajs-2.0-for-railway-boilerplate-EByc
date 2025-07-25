import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Kontakt | Gmorkl Store",
  description: "Kontaktieren Sie uns bei Fragen, Anregungen oder Anliegen.",
}

export default function KontaktPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 pt-10 pb-20">
      <h1 className="text-4xl font-[505] tracking-wider mb-6 uppercase">Kontakt</h1>
      <p className="mb-6">
        Wenn Sie Fragen zu unseren Produkten, Ihrer Bestellung oder sonstige Anliegen haben, erreichen Sie uns unter:
      </p>
      <ul className="mb-6 space-y-2">
        <li>
          📧 E-Mail:{" "}
          <a href="mailto:info@gmorkl.de" className="underline hover:text-ui-fg-base">
            info@gmorkl.de
          </a>
        </li>
        <li>
          📞 Telefon:{" "}
          <a href="tel:+491234567890" className="underline hover:text-ui-fg-base">
            +49 123 456 7890
          </a>
        </li>
        <li>📍 Adresse: Gmorkl GmbH, Musterstraße 12, 50667 Köln, Deutschland</li>
      </ul>
      <p>
        Wir bemühen uns, alle Anfragen innerhalb von 24 Stunden an Werktagen zu beantworten.
      </p>
    </div>
  )
}
