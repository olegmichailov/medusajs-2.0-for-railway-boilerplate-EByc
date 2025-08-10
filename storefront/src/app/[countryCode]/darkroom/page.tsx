import dynamic from "next/dynamic"

// ВАЖНО: ssr:false и БЕЗ loading, чтобы на сервере не отрисовывалось НИЧЕГО.
// Тогда гидрировать будет нечего, и ошибок 418/425 не будет.
const EditorCanvas = dynamic(() => import("@/modules/darkroom/EditorCanvas"), {
  ssr: false,
})

export default function DarkroomPage() {
  return (
    // Доп. защита от любых «не совпало»: полностью подавляем гидрацию контейнера.
    <div suppressHydrationWarning>
      <EditorCanvas />
    </div>
  )
}
