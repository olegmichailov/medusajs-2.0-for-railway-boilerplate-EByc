export default function NotFound() {
  return (
    <div className="flex flex-col gap-4 items-center justify-center min-h-[calc(100vh-64px)]">
      <h1 className="text-4xl font-[505] uppercase text-ui-fg-base">Seite nicht gefunden</h1>
      <p className="text-base text-ui-fg-base">
        Die Seite existiert nicht oder wurde verschoben.
      </p>
      <a
        href="/"
        className="mt-6 px-6 py-3 bg-black text-white rounded uppercase font-semibold tracking-wider hover:bg-red-700 transition"
      >
        Zur Startseite
      </a>
    </div>
  )
}
