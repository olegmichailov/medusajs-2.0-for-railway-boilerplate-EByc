import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Widerrufsrecht | Gmorkl Store",
  description: "Informationen zum gesetzlichen Widerrufsrecht im Gmorkl Store.",
}

export default function WiderrufPage() {
  return (
    <div className="content-container py-16 sm:py-24 font-sans text-base tracking-wider">
      <h1 className="text-4xl font-[505] uppercase tracking-wider mb-8">
        Widerrufsbelehrung
      </h1>

      <h2 className="text-lg font-semibold mt-10 mb-2">1. Widerrufsrecht</h2>
      <p className="mb-6">
        Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.
      </p>

      <p className="mb-6">
        Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter
        – der nicht der Beförderer ist – die Ware in Besitz genommen haben bzw. hat.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">2. Ausübung des Widerrufs</h2>
      <p className="mb-6">
        Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (Gmorkl Store, Masha Rodigina, Beispielstraße 12, 50667 Köln,
        kontakt@gmorkl.de) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder E-Mail) über
        Ihren Entschluss, diesen Vertrag zu widerrufen, informieren.
      </p>

      <p className="mb-6">
        Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts
        vor Ablauf der Widerrufsfrist absenden.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">3. Folgen des Widerrufs</h2>
      <p className="mb-6">
        Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben,
        einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine
        andere Art der Lieferung als die von uns angebotene günstigste Standardlieferung gewählt haben), unverzüglich
        und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf
        dieses Vertrags bei uns eingegangen ist.
      </p>

      <p className="mb-6">
        Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion
        eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">4. Rücksendung</h2>
      <p className="mb-6">
        Sie haben die Waren unverzüglich und in jedem Fall spätestens binnen vierzehn Tagen ab dem Tag, an dem Sie uns
        über den Widerruf dieses Vertrags unterrichten, an uns zurückzusenden oder zu übergeben.
      </p>

      <p className="mb-6">
        Die Frist ist gewahrt, wenn Sie die Waren vor Ablauf der Frist von vierzehn Tagen absenden.
        Sie tragen die unmittelbaren Kosten der Rücksendung der Waren.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">5. Ausschluss des Widerrufs</h2>
      <p>
        Das Widerrufsrecht besteht nicht bei Verträgen zur Lieferung von Waren, die nach Kundenspezifikation angefertigt
        werden oder eindeutig auf die persönlichen Bedürfnisse zugeschnitten sind.
      </p>
    </div>
  )
}
