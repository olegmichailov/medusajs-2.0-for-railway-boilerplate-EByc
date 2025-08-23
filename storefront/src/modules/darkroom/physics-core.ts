"use client"

import Matter, {
  Engine, World, Bodies, Body, Runner, Constraint
} from "matter-js"
import decomp from "poly-decomp"

// enable concave decomposition for fromVertices
;(window as any).decomp = decomp

export type PhysRole = "off" | "collider" | "rigid" | "rope"

export type LayerGeom =
  | { kind:"rect"; x:number; y:number; w:number; h:number; angle:number }
  | { kind:"circle"; x:number; y:number; r:number }
  | { kind:"polygon"; x:number; y:number; angle:number; points:{x:number;y:number}[] }
  | { kind:"rope"; points:{x:number;y:number}[] }

export type PhysItem = {
  id: string
  role: PhysRole
  geom: LayerGeom
  initial?: { x:number; y:number; angle:number }
}

export type Gravity = { dirRad:number; strength:number }

type Mapped = {
  id: string
  bodies: Matter.Body[]
  constraints?: Matter.Constraint[]
}

export type PhysCore = {
  play(): void
  pause(): void
  reset(): void
  setGravity(g: Gravity): void
  upsert(items: PhysItem[]): void
  remove(ids: string[]): void
  readPositions(): Record<string, { x:number; y:number; angle:number }[]>
  isPlaying(): boolean
  destroy(): void
}

export function makePhysics(): PhysCore {
  const engine = Engine.create({ enableSleeping: true })
  const world  = engine.world
  world.gravity.scale = 0.001

  const runner = Runner.create({ isFixed: true, delta: 1000/60 })
  let playing = false
  const mapped = new Map<string, Mapped>()

  const setGravity = (g: Gravity) => {
    world.gravity.x = Math.cos(g.dirRad) * g.strength
    world.gravity.y = Math.sin(g.dirRad) * g.strength
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
      const {points, x, y, angle} = it.geom
      const body = Bodies.fromVertices(x, y, points as any, { isStatic }, true) as any
      const bodies = Array.isArray(body) ? body : [body]
      bodies.forEach(b => { Body.setAngle(b, angle) })
      World.add(world, bodies)
      return { id: it.id, bodies }
    }

    if (it.geom.kind === "rope") {
      const pts = it.geom.points
      if (pts.length < 2) return null
      const nodes: Matter.Body[] = []
      const segLen = Math.max(4, Math.min(24, Math.hypot(pts[1].x-pts[0].x, pts[1].y-pts[0].y)))
      const count  = Math.max(3, Math.min(60, Math.round(pts.length * 0.75)))
      for (let i=0;i<count;i++){
        const t = i/(count-1)
        const idx = Math.round(t*(pts.length-1))
        const p = pts[idx]
        nodes.push(Bodies.circle(p.x, p.y, Math.max(2, segLen*0.3), { isStatic:false, frictionAir:0.02 }))
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
    const incoming = new Set(items.map(i => i.id))
    Array.from(mapped.keys()).forEach(id => {
      if (!incoming.has(id)) clearFor(id)
    })
    items.forEach(it => {
      clearFor(it.id)
      const m = makeFor(it)
      if (m) mapped.set(it.id, m)
    })
  }

  const remove = (ids: string[]) => { ids.forEach(clearFor) }

  const play = () => { if (!playing) { playing = true; Runner.start(runner, engine) } }
  const pause = () => { playing = false; Runner.stop(runner) }
  const reset = () => { pause(); Array.from(mapped.keys()).forEach(id => clearFor(id)) }
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
