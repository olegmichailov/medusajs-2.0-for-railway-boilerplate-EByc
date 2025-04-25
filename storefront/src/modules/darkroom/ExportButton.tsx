"use client"

export default function ExportButton({ canvasRef }) {
  const handleExport = () => {
    if (!canvasRef.current) return

    const dataUrl = canvasRef.current.toDataURL({
      format: "png",
      multiplier: 4, // Повышенное разрешение для печати (4x = 300+ dpi)
    })

    const link = document.createElement("a")
    link.href = dataUrl
    link.download = "gmorkl_editor.png"
    link.click()
  }

  return (
    <div className="mt-4">
      <button
        onClick={handleExport}
        className="px-6 py-2 uppercase text-sm tracking-wider border border-white hover:bg-white hover:text-black"
      >
        Print
      </button>
    </div>
  )
}
