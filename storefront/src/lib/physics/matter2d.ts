// lib/physics/matter2d.ts
import Matter, { Engine, World, Bodies, Body, Composite, Constraint, Runner } from "matter-js"

export type PhysicsRole = "off" | "rigid" | "collider" | "rope"

export type Gravity = { angleDeg: number; magnitude: number } // magnitude: 0..1 (нормировано)
export type Snapshot = Record<string, { x: number; y: number; rot: number }>

export type InputShape =
  | { id: string; kind: "rect"; x: number; y: number; w: number; h: number; rot: number; role: PhysicsRole; isSensor?: boolean }
  | { id: string; kind: "circle"; x: number; y: number; r: number; rot: number; role: PhysicsRole; isSensor?: boolean }
  | { id: string; kind: "line"; idStroke: string; points: number[]; strokeW: number; role: PhysicsRole } // для ROPE

export type EngineHooks = {
  onPose?: (poses: Snapshot) => void
}

export class MatterAdapter {
  engine: Engine
  runner: Runner
  world: World
  bodiesById = new Map<string, Body>()
  private initial: Snapshot = {}
  private ropeGroup = Body.nextGroup(true) // негативный индекс => части одной верёвки между собой не коллидятся
  private rigidGroup = Body.nextGroup(true)

  constructor(
    private width: number,
    private height: number,
    private hooks?: EngineHooks
  ) {
    this.engine = Engine.create({ gravity: { x: 0, y: 1 } })
    this.world = this.engine.world
    this.runner = Runner.create()
    // немного стабильности
    this.engine.timing.timeScale = 1
  }

  setGravity(g: Gravity) {
    const a = (g.angleDeg * Math.PI) / 180
    const m = Math.max(0, Math.min(1, g.magnitude))
    // 1 = земная гравитация вниз. Масштабируем мягко
    this.engine.gravity.x = Math.cos(a) * m
    this.engine.gravity.y = Math.sin(a) * m
  }

  reset() {
    // вернуть в initial
    for (const [id, b] of this.bodiesById) {
      const snap = this.initial[id]
      if (!snap) continue
      Body.setPosition(b, { x: snap.x, y: snap.y })
      Body.setAngle(b, snap.rot)
      Body.setVelocity(b, { x: 0, y: 0 })
      Body.setAngularVelocity(b, 0)
      Body.setStatic(b, (b as any)._isStaticInit ?? false)
    }
  }

  clear() {
    this.pause()
    Composite.clear(this.world, false, true)
    this.bodiesById.clear()
    this.initial = {}
  }

  build(shapes: InputShape[]) {
    this.clear()

    // Статические “стены” по периметру, чтобы ничего не улетало
    const wallT = Bodies.rectangle(this.width / 2, -50, this.width, 100, { isStatic: true })
    const wallB = Bodies.rectangle(this.width / 2, this.height + 50, this.width, 100, { isStatic: true })
    const wallL = Bodies.rectangle(-50, this.height / 2, 100, this.height, { isStatic: true })
    const wallR = Bodies.rectangle(this.width + 50, this.height / 2, 100, this.height, { isStatic: true })
    World.add(this.world, [wallT, wallB, wallL, wallR])

    for (const s of shapes) {
      if (s.kind === "line" && s.role === "rope") {
        this.buildRope(s.idStroke, s.points, Math.max(6, s.strokeW))
        continue
      }

      const isCollider = s.role === "collider"
      const isRigid = s.role === "rigid"

      let body: Body | null = null
      if (s.kind === "rect") {
        body = Bodies.rectangle(s.x + s.w / 2, s.y + s.h / 2, s.w, s.h, {
          angle: s.rot,
          isStatic: isCollider,
          isSensor: !!s.isSensor,
        })
      } else if (s.kind === "circle") {
        body = Bodies.circle(s.x, s.y, s.r, {
          angle: s.rot,
          isStatic: isCollider,
          isSensor: !!s.isSensor,
        })
      }

      if (!body) continue

      // у “жёстких” фигур внутри одной композитной конструкции можно отключать self-collision
      if (isRigid) {
        body.collisionFilter.group = this.rigidGroup
      }

      ;(body as any)._isStaticInit = isCollider
      World.add(this.world, body)
      this.bodiesById.set(s.id, body)
      this.initial[s.id] = { x: body.position.x, y: body.position.y, rot: body.angle }
    }
  }

  private buildRope(idStroke: string, points: number[], strokeW: number) {
    if (points.length < 4) return
    // Квантование: каждый k-й пункт как узел
    const step = Math.max(1, Math.floor(points.length / 40))
    const nodes: Body[] = []
    for (let i = 0; i < points.length; i += 2 * step) {
      const x = points[i]
      const y = points[i + 1]
      const r = Math.max(2, strokeW * 0.4)
      const b = Bodies.circle(x, y, r, {
        friction: 0.9,
        frictionAir: 0.01,
        restitution: 0.1,
      })
      // у одной верёвки — нет self-collision
      b.collisionFilter.group = this.ropeGroup
      nodes.push(b)
    }
    // constraints (пружинки)
    const cons: Constraint[] = []
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1]
      const b = nodes[i]
      const dist = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y)
      cons.push(
        Constraint.create({
          bodyA: a,
          bodyB: b,
          length: dist * 0.98,
          stiffness: 0.9,
          damping: 0.15,
        })
      )
    }
    World.add(this.world, [...nodes, ...cons])
    this.bodiesById.set(idStroke, nodes[0]) // маркер, чтобы трекать в snapshot
    this.initial[idStroke] = { x: nodes[0].position.x, y: nodes[0].position.y, rot: nodes[0].angle }
  }

  play() {
    Runner.start(this.runner, this.engine)
  }

  pause() {
    Runner.stop(this.runner)
  }

  tickOnce(dtMs = 16.666) {
    Engine.update(this.engine, dtMs)
    this.emitPose()
  }

  emitPose() {
    if (!this.hooks?.onPose) return
    const snap: Snapshot = {}
    for (const [id, b] of this.bodiesById) {
      snap[id] = { x: b.position.x, y: b.position.y, rot: b.angle }
    }
    this.hooks.onPose(snap)
  }
}
