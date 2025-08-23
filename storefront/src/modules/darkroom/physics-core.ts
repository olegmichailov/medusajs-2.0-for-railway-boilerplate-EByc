"use client"

import Matter, {
  Engine, World, Bodies, Body, Composite, Composites, Constraint, Runner, Vertices
} from "matter-js"

// ВАЖНО: юниты = пиксели макета (BASE_W/BASE_H). Никаких viewport-скейлов.
export type PhysRole = "off" | "collider" | "rigid" | "rope"

export type LayerGeom =
  | { kind:"rect"; x:number; y:number; w:number; h:number; angle:number }
  | { kind:"circle"; x:number; y:number; r:number }
  | { kind:"polygon"; x:number; y:number; angle:number; points:{x:number;y:number}[] }
  | { kind:"rope"; points:{x:number;y:number}[] } // для brush: семплированный путь

export type PhysItem = {
  id: string
  role: PhysRole
  geom: LayerGeom
  // исходное положение для reset-броска:
  initial?: { x:number; y:number; angle:number }
}

export type Gravity = { dirRad:number; strength:number } // strength ~ 0..1

type Mapped = {
  id: string
  bodies: Matter.Body[]          // rope = множество; остальное 1
  constraints?: Matter.Constraint[]
}

export type PhysCore = {
  play(): void
  pause(): void
  reset(): void
  setGravity(g: Gravity): void
  upsert(items: PhysItem[]): void      // полная синхронизация со слоем
  remove(ids: string[]): void
  // «пуш» координат в Konva (на каждом тике ты заберёшь позы)
  readPositions(): Record<string, { x:number; y:number; angle:number }[]>
  isPlaying(): boolean
  destroy(): void
}

export function makePhysics(): PhysCore {
  const engine = Engine.create({ enableSleeping: true })
  const world  = engine.world
  world.gravity.scale = 0.001   // нежная гравитация, нормируем силой

  const runner = Runner.create({ isFixed: true, delta: 1000/60 })
  let playing = false

  const mapped = new Map<string, Mapped>()    // layerId -> bodies

  const byId = (id:string) => mapped.get(id)

  const setGravity = (g: Gravity) => {
    const gx = Math.cos(g.dirRad) * g.strength
    const gy = Math.sin(g.dirRad) * g.strength
    // Matter использует g.x/g.y как ускорение в «g», а scale как коэффициент:
    world.gravity.x = gx
    world.gravity.y = gy
  }

  const clearFor = (id:string) => {
    const m = mapped.get(id)
    if (!m) return
    m.constraints?.forEach(c => World.remove(world, c))
    m.bodies.forEach(b => World.remove(world, b))
    mapped.delete(id)
  }

  const makeFor = (it: PhysItem): Mapped | null => {
    if (it.role === "off") return null

    // collider => isStatic
    const isStatic = it.role === "collider"

    if (it.geom.kind === "rect") {
      const {x,y,w,h,angle} = it.geom
      const body = Bodies.rectangle(x + w/2, y + h/2, w, h, { isStatic })
      Body.setAngle(body, angle)
      World.add(world, body)
      return { id: it.id, bodies: [body] }
    }

    if (it.geom.kind === "circle") {
      const {x,y,r} = it.geom
      const body = Bodies.circle(x, y, r, { isStatic })
      World.add(world, body)
      return { id: it.id, bodies: [body] }
    }

    if (it.geom.kind === "polygon") {
      const {x,y,angle,points} = it.geom
      // points — в локальных коордах? Здесь — абсолютные. Центрируем:
      const verts = points.map(p => ({ x: p.x, y: p.y }))
      // Matter умеет из «многоугольника» (в т.ч. невыпуклого) через decomp (poly-decomp)
      const body = Bodies.fromVertices(x, y, verts as any, { isStatic }, true)
      if (!body) return null
      Body.setAngle(body, angle)
      World.add(world, body)
      return { id: it.id, bodies: Array.isArray(body) ? body : [body] }
    }

    if (it.geom.kind === "rope") {
      // делаем «верёвку» из маленьких кругов, связанных constraints
      const pts = it.geom.points
      if (pts.length < 2) return null
      const segLen = Math.max(4, Math.min(24, Math.hypot(pts[1].x-pts[0].x, pts[1].y-pts[0].y)))
      const count  = Math.max(3, Math.min(60, Math.round(pts.length * 0.75)))
      const nodes: Matter.Body[] = []
      for (let i=0;i<count;i++){
        const t = i/(count-1)
        const idx = Math.round(t*(pts.length-1))
        const p = pts[idx]
        nodes.push(Bodies.circle(p.x, p.y, Math.max(2, segLen*0.3), { isStatic: false, frictionAir: 0.02 }))
      }
      World.add(world, nodes)
      const cons: Matter.Constraint[] = []
      for (let i=1;i<nodes.length;i++){
        cons.push(Constraint.create({
          bodyA: nodes[i-1], bodyB: nodes[i],
          stiffness: 0.9, length: segLen, damping: 0.2
        }))
      }
      cons.forEach(c => World.add(world, c))
      return { id: it.id, bodies: nodes, constraints: cons }
    }

    return null
  }

  const upsert = (items: PhysItem[]) => {
    // простая стратегия: по id пересобираем
    const incoming = new Set(items.map(i => i.id))
    // удалить исчезнувшее
    Array.from(mapped.keys()).forEach(id => {
      if (!incoming.has(id)) clearFor(id)
    })
    // вставить/обновить
    items.forEach(it => {
      clearFor(it.id)
      const m = makeFor(it)
      if (m) mapped.set(it.id, m)
    })
  }

  const remove = (ids: string[]) => { ids.forEach(clearFor) }

  const play = () => {
    if (playing) return
    playing = true
    Runner.start(runner, engine)
  }

  const pause = () => {
    playing = false
    Runner.stop(runner)
  }

  const reset = () => {
    pause()
    // удалить все тела
    Array.from(mapped.keys()).forEach(id => clearFor(id))
  }

  const readPositions = () => {
    const out: Record<string, {x:number;y:number;angle:number}[]> = {}
    mapped.forEach((m, id) => {
      out[id] = m.bodies.map(b => ({ x: b.position.x, y: b.position.y, angle: b.angle }))
    })
    return out
  }

  const isPlaying = () => playing

  const destroy = () => { reset() }

  return { play, pause, reset, setGravity, upsert, remove, readPositions, isPlaying, destroy }
}
