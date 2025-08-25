// Клиентский ленивый лоадер Rapier WASM
let R: any | null = null

export async function getRapier() {
  if (typeof window === "undefined") return null
  if (R) return R
  const mod: any = await import("@dimforge/rapier2d-compat")
  // 💡 КРИТИЧНО: инициализация WASM
  await mod.init()
  R = mod
  return R
}
