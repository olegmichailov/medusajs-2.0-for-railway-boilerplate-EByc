import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Widerruf | Gmorkl Store",
  description: "Informationen zum Widerrufsrecht beim Gmorkl Store.",
}

export default function WiderrufPage() {
  return (
    <div className="content-container py-16 sm:py-24 font-sans text-base tracking-wider">
      <h1 className="text-4xl font-[505] uppercase tracking-wider mb-8">
        Widerrufsrecht
      </h1>

      <p className="mb-6">
        Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Widerrufsfrist</h2>
      <p className="mb-6">
        Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter die Ware in Besitz genommen haben.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Um Ihr Widerrufsrecht auszuüben</h2>
      <p className="mb-6">
        müssen Sie uns (Gmorkl Store, Masha Rodigina, Beispielstraße 12, 50667 Köln, E-Mail: kontakt@gmorkl.de) mittels einer eindeutigen Erklärung über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Folgen des Widerrufs</h2>
      <p className="mb-6">
        Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, spätestens binnen vierzehn Tagen zurückzuzahlen. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Rücksendung der Ware</h2>
      <p className="mb-6">
        Sie haben die Waren unverzüglich und in jedem Fall spätestens binnen vierzehn Tagen ab dem Tag, an dem Sie uns über den Widerruf dieses Vertrags unterrichten, an uns zurückzusenden. Sie tragen die unmittelbaren Kosten der Rücksendung der Waren.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">Ausschluss des Widerrufsrechts</h2>
      <p>
        Das Widerrufsrecht besteht nicht bei Lieferung von Waren, die nach Kundenspezifikation angefertigt wurden oder eindeutig auf die persönlichen Bedürfnisse zugeschnitten sind.
      </p>
    </div>
  )
}
