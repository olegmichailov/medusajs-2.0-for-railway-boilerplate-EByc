// app/[countryCode]/darkroom/page.tsx
import dynamic from "next/dynamic";

export const dynamicParams = true;

const EditorCanvas = dynamic(
  () => import("@/modules/darkroom/EditorCanvas"),
  { ssr: false } // ВАЖНО: никакого SSR для Konva
);

export default function DarkroomPage() {
  return (
    <div className="min-h-[calc(100vh-80px)]">
      <EditorCanvas />
    </div>
  );
}
