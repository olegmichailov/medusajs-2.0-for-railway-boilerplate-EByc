import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Rückgabe & Widerruf | Gmorkl Store",
  description: "Informationen zu Rückgabe, Umtausch und Widerrufsrecht im Gmorkl Store.",
}

export default function RueckgabePage() {
  return (
    <div className="content-container py-16 sm:py-24 font-sans text-base tracking-wider">
      <h1 className="text-4xl font-[505] uppercase tracking-wider mb-8">Rückgabe & Widerruf</h1>

      <p className="mb-6">
        Wir möchten, dass Sie mit Ihrem Einkauf zufrieden sind. Sollten Sie einen Artikel zurückgeben oder vom Kauf
        zurücktreten wollen, beachten Sie bitte die folgenden Informationen.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Widerrufsrecht</h2>
      <p className="mb-6">
        Sie haben das Recht, binnen 14 Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist
        beträgt 14 Tage ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter die Ware in Besitz genommen haben.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Folgen des Widerrufs</h2>
      <p className="mb-6">
        Wenn Sie diesen Vertrag widerrufen, erstatten wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben,
        einschließlich der Lieferkosten, unverzüglich und spätestens binnen 14 Tagen ab dem Tag, an dem die Mitteilung
        über Ihren Widerruf bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das
        Sie bei der ursprünglichen Transaktion eingesetzt haben.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Rücksendung der Ware</h2>
      <p className="mb-6">
        Sie haben die Waren unverzüglich und in jedem Fall spätestens binnen 14 Tagen ab dem Tag, an dem Sie uns über
        den Widerruf unterrichten, an uns zurückzusenden. Die Frist ist gewahrt, wenn Sie die Waren vor Ablauf der
        Frist absenden. Sie tragen die unmittelbaren Kosten der Rücksendung.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Ausschluss des Widerrufs</h2>
      <p className="mb-6">
        Das Widerrufsrecht besteht nicht bei individuell angefertigten Produkten oder personalisierter Ware.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Kontakt für Rückgaben</h2>
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
