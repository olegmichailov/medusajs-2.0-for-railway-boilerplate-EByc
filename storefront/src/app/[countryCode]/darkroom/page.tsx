import dynamic from "next/dynamic"

const EditorCanvas = dynamic(() => import("@/modules/darkroom/EditorCanvas"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[70vh] flex items-center justify-center">
      Loading editor…
    </div>
  ),
})

export default function DarkroomPage() {
  // Важно: страница серверная. На сервере выйдет только плейсхолдер из loading,
  // сам EditorCanvas монтируется ТОЛЬКО на клиенте.
  return <EditorCanvas />
}
