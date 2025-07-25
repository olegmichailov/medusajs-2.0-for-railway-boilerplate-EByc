import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Widerrufsrecht | Gmorkl Store",
  description: "Informationen zum gesetzlichen Widerrufsrecht im Gmorkl Store.",
}

export default function WiderrufPage() {
  return (
    <div className="content-container py-16 sm:py-24 font-sans text-base tracking-wider">
      <h1 className="text-4xl font-[505] uppercase tracking-wider mb-8">
        Widerrufsbelehrung & Rückgabe
      </h1>

      <h2 className="text-lg font-semibold mt-10 mb-2">1. Widerrufsrecht</h2>
      <p className="mb-6">
        Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Frist beginnt ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter die Ware erhalten haben.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">2. Rückgabe & Rücksendekosten</h2>
      <p className="mb-6">
        Im Falle eines Widerrufs tragen Sie die unmittelbaren Kosten der Rücksendung der Ware. Die Rücksendung senden Sie bitte an:<br/>
        Maria Rodigina, Simon-Meister-Str. 24, 50733 Köln
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">3. Erstattung</h2>
      <p className="mb-6">
        Nach Eingang und Prüfung der Rücksendung wird Ihnen der Kaufbetrag spätestens binnen 14 Tagen über das ursprüngliche Zahlungsmittel erstattet.
      </p>

      <h2 className="text-lg font-semibold mt-10 mb-2">4. Ausnahmen</h2>
      <p>
        Das Widerrufsrecht besteht nicht bei individuell angefertigten Produkten oder personalisierter Ware.
      </p>
    </div>
  )
}
