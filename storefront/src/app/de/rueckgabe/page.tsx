import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Rückgabe | Gmorkl Store",
  description: "Informationen zum Widerrufsrecht und zur Rückgabe im Gmorkl Store.",
}

export default function RueckgabePage() {
  return (
    <div className="content-container py-16 sm:py-24 font-sans text-base tracking-wider">
      <h1 className="text-4xl font-[505] uppercase tracking-wider mb-8">
        Rückgabe & Widerrufsrecht
      </h1>

      <h2 className="text-lg font-semibold mt-10 mb-2">1. Widerrufsrecht</h2>
      <p className="mb-6">
        Verbraucher haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.
      </p>
      <p className="mb-6">
        Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter die Ware in Besitz genommen haben.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">2. Widerrufsbelehrung</h2>
      <p className="mb-6">
        Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (Gmorkl Store, Masha Rodigina, Beispielstraße 12, 50667 Köln, kontakt@gmorkl.de) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder E-Mail) über Ihren Entschluss informieren.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">3. Folgen des Widerrufs</h2>
      <p className="mb-6">
        Wenn Sie diesen Vertrag widerrufen, erstatten wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme zusätzlicher Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung gewählt haben).
      </p>
      <p className="mb-6">
        Die Rückzahlung erfolgt unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag, an dem die Mitteilung über Ihren Widerruf bei uns eingegangen ist.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">4. Rücksendung der Ware</h2>
      <p className="mb-6">
        Sie haben die Ware unverzüglich und in jedem Fall spätestens binnen vierzehn Tagen ab dem Tag, an dem Sie uns über den Widerruf unterrichten, an uns zurückzusenden.
      </p>
      <p className="mb-6">
        Die unmittelbaren Kosten der Rücksendung tragen Sie selbst. Für einen etwaigen Wertverlust müssen Sie nur aufkommen, wenn dieser auf einen zur Prüfung der Beschaffenheit, Eigenschaften und Funktionsweise der Waren nicht notwendigen Umgang zurückzuführen ist.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">5. Ausschluss des Widerrufsrechts</h2>
      <p>
        Das Widerrufsrecht besteht nicht bei Verträgen zur Lieferung von Waren, die nach Kundenspezifikation angefertigt werden oder eindeutig auf die persönlichen Bedürfnisse zugeschnitten sind.
      </p>
    </div>
  )
}
