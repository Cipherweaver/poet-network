import { useEffect, useMemo, useRef, useState } from 'react'
import {
  clampPan,
  createBackgroundStars,
  findProjectedPoetAtPoint,
} from '../lib/graph'
import type { CanvasPoint, CanvasSize, PoetGraph, PoetNode, ProjectedPoet } from '../types'

type PoetSceneProps = {
  graph: PoetGraph
  hoveredId: string | null
  onClear: () => void
  onHover: (poetId: string | null) => void
  onSelect: (poetId: string) => void
  selectedId: string | null
}

type OrbitState = {
  pitch: number
  yaw: number
}

type DragState = {
  active: boolean
  button: number | null
  lastPoint: CanvasPoint
  lastTimestamp: number
  moved: boolean
  pointerId: number | null
  pressedTargetId: string | null
  startPoint: CanvasPoint
  startOrbit: OrbitState
}

const initialDragState: DragState = {
  active: false,
  button: null,
  lastPoint: { x: 0, y: 0 },
  lastTimestamp: 0,
  moved: false,
  pointerId: null,
  pressedTargetId: null,
  startPoint: { x: 0, y: 0 },
  startOrbit: { pitch: 0, yaw: 0 },
}

const AMBIENT_EDGE_LIMIT = 240
const AMBIENT_PER_POET_LIMIT = 3
const BACKGROUND_FRAME_INTERVAL = 1000 / 30
const INTERACTION_BACKGROUND_FRAME_INTERVAL = 1000 / 20
const INTERACTION_DECOR_FREEZE_MS = 220
const MAX_CANVAS_DPR = 1.5
const ROTATION_SPEED = 0.000045
const YAW_DRAG_SPEED = 0.0052
const PITCH_DRAG_SPEED = 0.0046
const ORBIT_VELOCITY_DAMPING = 0.92
const ORBIT_VELOCITY_EPSILON = 0.00002
const DRAG_VELOCITY_BLEND = 0.64
const POINTER_HIT_PADDING = 14
const DRAG_THRESHOLD = 6
const ZOOM_MIN = 0.78
const ZOOM_MAX = 1.52
const ZOOM_SETTLE_THRESHOLD = 0.012
const ZOOM_WHEEL_SPEED = 0.0011
const EMPTY_RELATIONS: PoetGraph['relations'] = []
const EMPTY_CONNECTIONS = new Set<string>()

type SceneMotion = {
  ambientDriftX: number
  ambientDriftY: number
  atmosphereAlpha: number
  atmosphereRadiusScale: number
  clusterBreath: number
  clusterLabelAlpha: number
  edgePulse: number
  fieldPulse: number
  membraneAlpha: number
  membraneShift: number
  nodeHaloScale: number
  nodePulseScale: number
  ringPulseScale: number
  starTwinkle: number
  timestamp: number
}

type SphereProjectedPoet = ProjectedPoet & {
  frontness: number
  sphereX: number
  sphereY: number
  sphereZ: number
}

type WarpStar = {
  radius: number
  speed: number
  x: number
  y: number
  z: number
}

export function PoetScene({
  graph,
  hoveredId,
  onClear,
  onHover,
  onSelect,
  selectedId,
}: PoetSceneProps) {
  const frameRef = useRef<number>(0)
  const backgroundCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const panRef = useRef<CanvasPoint>({ x: 0, y: 0 })
  const ambientPanRef = useRef<CanvasPoint>({ x: 0, y: 0 })
  const rotationRef = useRef(0)
  const pitchRef = useRef(0)
  const orbitOffsetRef = useRef<OrbitState>({ pitch: 0, yaw: 0 })
  const orbitVelocityRef = useRef<OrbitState>({ pitch: 0, yaw: 0 })
  const zoomRef = useRef(1)
  const zoomTargetRef = useRef(1)
  const projectedPoetsRef = useRef<SphereProjectedPoet[]>([])
  const selectionPulseRef = useRef<{ id: string | null; start: number }>({ id: null, start: 0 })
  const warpStarsRef = useRef<WarpStar[]>([])
  const dragRef = useRef<DragState>(initialDragState)
  const backgroundTimestampRef = useRef(0)
  const interactionUntilRef = useRef(0)
  const isDocumentVisibleRef = useRef(typeof document === 'undefined' ? true : !document.hidden)
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 })
  const [isDragging, setIsDragging] = useState(false)

  const stars = useMemo(() => createBackgroundStars(90), [])
  const ambientRelations = useMemo(() => buildAmbientRelations(graph), [graph])
  const relationIndex = useMemo(() => buildRelationIndex(graph.relations), [graph.relations])
  const selectedPoet = useMemo(
    () => (selectedId ? graph.poets.find((poet) => poet.id === selectedId) ?? null : null),
    [graph.poets, selectedId],
  )
  const selectedConnections = useMemo(
    () => (selectedId ? new Set(relationIndex.neighbors.get(selectedId) ?? []) : EMPTY_CONNECTIONS),
    [relationIndex.neighbors, selectedId],
  )
  const renderedRelations = useMemo(() => {
    if (selectedId) {
      return relationIndex.byPoet.get(selectedId) ?? EMPTY_RELATIONS
    }

    return ambientRelations
  }, [ambientRelations, relationIndex.byPoet, selectedId])

  useEffect(() => {
    const element = sceneRef.current

    if (!element) {
      return undefined
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]

      if (!entry) {
        return
      }

      setSize({
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height),
      })
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const handleVisibilityChange = () => {
      isDocumentVisibleRef.current = !document.hidden

      if (isDocumentVisibleRef.current) {
        backgroundTimestampRef.current = 0
        interactionUntilRef.current = performance.now() + INTERACTION_DECOR_FREEZE_MS
      }
    }

    handleVisibilityChange()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  useEffect(() => {
    const canvas = backgroundCanvasRef.current

    if (!canvas || size.width === 0 || size.height === 0) {
      return undefined
    }

    const context = canvas.getContext('2d')

    if (!context) {
      return undefined
    }

    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR)
    canvas.width = Math.max(1, Math.floor(size.width * devicePixelRatio))
    canvas.height = Math.max(1, Math.floor(size.height * devicePixelRatio))
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`
    warpStarsRef.current = createWarpStars(size, resolveWarpStarCount(size))
    backgroundTimestampRef.current = 0
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    drawWarpBackground(context, size, warpStarsRef.current, 16)
    return undefined
  }, [size])

  useEffect(() => {
    if (!selectedId || size.width === 0 || size.height === 0) {
      return
    }

    const poet = graph.poets.find((item) => item.id === selectedId)

    if (!poet) {
      return
    }

    panRef.current = { x: 0, y: clampPan({ x: 0, y: -poet.position.y * size.height * 0.12 }).y }
  }, [graph.poets, selectedId, size])

  useEffect(() => {
    if (selectedId) {
      interactionUntilRef.current = performance.now() + INTERACTION_DECOR_FREEZE_MS
    }
  }, [selectedId])

  useEffect(() => {
    selectionPulseRef.current = {
      id: selectedId,
      start: selectedId ? performance.now() : 0,
    }
  }, [selectedId])

  useEffect(() => {
    const canvas = canvasRef.current
    const backgroundCanvas = backgroundCanvasRef.current

    if (!canvas || !backgroundCanvas || size.width === 0 || size.height === 0) {
      return undefined
    }

    const context = canvas.getContext('2d')
    const backgroundContext = backgroundCanvas.getContext('2d')

    if (!context || !backgroundContext) {
      return undefined
    }

    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR)
    const backgroundDevicePixelRatio = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR)
    canvas.width = Math.max(1, Math.floor(size.width * devicePixelRatio))
    canvas.height = Math.max(1, Math.floor(size.height * devicePixelRatio))
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`
    backgroundCanvas.width = Math.max(1, Math.floor(size.width * backgroundDevicePixelRatio))
    backgroundCanvas.height = Math.max(1, Math.floor(size.height * backgroundDevicePixelRatio))
    backgroundCanvas.style.width = `${size.width}px`
    backgroundCanvas.style.height = `${size.height}px`
    backgroundTimestampRef.current = 0

    const render = (timestamp: number) => {
      if (!isDocumentVisibleRef.current) {
        frameRef.current = window.requestAnimationFrame(render)
        return
      }

      const motion = getSceneMotion(timestamp)
      const autoRotation = timestamp * ROTATION_SPEED
      const isActivelyDragging = dragRef.current.active
      zoomRef.current += (zoomTargetRef.current - zoomRef.current) * 0.14
      const isZoomSettling = Math.abs(zoomTargetRef.current - zoomRef.current) > ZOOM_SETTLE_THRESHOLD
      const useReducedDetail = isActivelyDragging || isZoomSettling || timestamp < interactionUntilRef.current
      if (!isActivelyDragging) {
        orbitOffsetRef.current = {
          yaw: normalizeAngle(orbitOffsetRef.current.yaw + orbitVelocityRef.current.yaw),
          pitch: normalizeAngle(orbitOffsetRef.current.pitch + orbitVelocityRef.current.pitch),
        }
        orbitVelocityRef.current = {
          yaw:
            Math.abs(orbitVelocityRef.current.yaw) < ORBIT_VELOCITY_EPSILON
              ? 0
              : orbitVelocityRef.current.yaw * ORBIT_VELOCITY_DAMPING,
          pitch:
            Math.abs(orbitVelocityRef.current.pitch) < ORBIT_VELOCITY_EPSILON
              ? 0
              : orbitVelocityRef.current.pitch * ORBIT_VELOCITY_DAMPING,
        }
      }
      const targetRotation = (selectedPoet ? getFrontFacingRotation(selectedPoet) : autoRotation) + orbitOffsetRef.current.yaw
      const targetPitch = (selectedPoet ? getFrontFacingPitch(selectedPoet) : 0) + orbitOffsetRef.current.pitch
      if (isActivelyDragging) {
        rotationRef.current = normalizeAngle(targetRotation)
        pitchRef.current = normalizeAngle(targetPitch)
      } else {
        rotationRef.current = blendAngle(rotationRef.current, targetRotation, selectedPoet ? 0.09 : 0.03)
        pitchRef.current = blendAngle(pitchRef.current, targetPitch, selectedPoet ? 0.1 : 0.045)
      }
      const zoomScale = zoomRef.current
      const sceneElement = sceneRef.current

      if (sceneElement) {
        const zoomLabel = zoomScale.toFixed(3)
        const yawLabel = rotationRef.current.toFixed(3)
        const pitchLabel = pitchRef.current.toFixed(3)
        const selectedLabel = selectedId ?? ''

        if (sceneElement.dataset.zoom !== zoomLabel) {
          sceneElement.dataset.zoom = zoomLabel
        }
        if (sceneElement.dataset.yaw !== yawLabel) {
          sceneElement.dataset.yaw = yawLabel
        }
        if (sceneElement.dataset.pitch !== pitchLabel) {
          sceneElement.dataset.pitch = pitchLabel
        }
        if (sceneElement.dataset.selected !== selectedLabel) {
          sceneElement.dataset.selected = selectedLabel
        }
      }

      ambientPanRef.current = selectedId
        ? { x: 0, y: 0 }
        : {
            x: motion.ambientDriftX,
            y: motion.ambientDriftY,
          }
      const viewport = {
        pan: {
          x: panRef.current.x + ambientPanRef.current.x,
          y: panRef.current.y + ambientPanRef.current.y,
        },
      }
      const projected = graph.poets.map((poet) =>
        projectPoetOnSphere(poet, viewport, size, rotationRef.current, pitchRef.current, zoomScale),
      )
      projectedPoetsRef.current = projected
      const projectedById = indexProjectedPoets(projected)
      const backgroundFrameInterval = useReducedDetail
        ? INTERACTION_BACKGROUND_FRAME_INTERVAL
        : BACKGROUND_FRAME_INTERVAL

      if (
        backgroundTimestampRef.current === 0 ||
        timestamp - backgroundTimestampRef.current >= backgroundFrameInterval
      ) {
        const backgroundDelta =
          backgroundTimestampRef.current === 0 ? 16 : Math.min(34, timestamp - backgroundTimestampRef.current)
        backgroundTimestampRef.current = timestamp
        backgroundContext.setTransform(backgroundDevicePixelRatio, 0, 0, backgroundDevicePixelRatio, 0, 0)
        drawWarpBackground(backgroundContext, size, warpStarsRef.current, backgroundDelta)
      }

      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      context.clearRect(0, 0, size.width, size.height)

      if (!useReducedDetail) {
        drawAtmosphere(context, size, motion)
        drawDepthVeils(context, size, motion)
      }
      drawSphereShell(context, size, rotationRef.current, pitchRef.current, motion, zoomScale, useReducedDetail)
      if (!useReducedDetail) {
        drawDynastyClusters(context, projected, motion)
      }
      drawStars(context, stars, size, viewport.pan, motion)
      drawEdges(
        context,
        renderedRelations,
        projectedById,
        selectedId,
        motion,
        size,
        viewport,
        zoomScale,
      )
      if (!useReducedDetail) {
        drawSelectionPulse(
          context,
          projected,
          selectedId,
          selectedConnections,
          motion,
          selectionPulseRef.current,
          size,
          viewport,
          zoomScale,
        )
      }
      drawNodes(
        context,
        projected,
        selectedId,
        selectedConnections,
        hoveredId,
        motion,
      )

      frameRef.current = window.requestAnimationFrame(render)
    }

    frameRef.current = window.requestAnimationFrame(render)

    return () => window.cancelAnimationFrame(frameRef.current)
  }, [
    graph,
    hoveredId,
    renderedRelations,
    selectedConnections,
    selectedId,
    selectedPoet,
    size,
    stars,
  ])

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return undefined
    }

    const handleWheelEvent = (event: WheelEvent) => {
      event.preventDefault()
      interactionUntilRef.current = performance.now() + INTERACTION_DECOR_FREEZE_MS
      zoomTargetRef.current = clampZoom(zoomTargetRef.current * Math.exp(-event.deltaY * ZOOM_WHEEL_SPEED))
    }

    canvas.addEventListener('wheel', handleWheelEvent, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheelEvent)
  }, [])

  function toCanvasPoint(clientX: number, clientY: number): CanvasPoint {
    const bounds = canvasRef.current?.getBoundingClientRect()

    if (!bounds) {
      return { x: 0, y: 0 }
    }

    return {
      x: clientX - bounds.left,
      y: clientY - bounds.top,
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = toCanvasPoint(event.clientX, event.clientY)
    const pressedTarget =
      event.button === 0
        ? findProjectedPoetAtPoint(projectedPoetsRef.current, point, POINTER_HIT_PADDING)?.id ?? null
        : null
    orbitVelocityRef.current = { pitch: 0, yaw: 0 }
    interactionUntilRef.current = performance.now() + INTERACTION_DECOR_FREEZE_MS
    dragRef.current = {
      active: true,
      button: event.button,
      lastPoint: point,
      lastTimestamp: performance.now(),
      moved: false,
      pointerId: event.pointerId,
      pressedTargetId: pressedTarget,
      startPoint: point,
      startOrbit: { ...orbitOffsetRef.current },
    }
    if (pressedTarget) {
      onHover(pressedTarget)
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = toCanvasPoint(event.clientX, event.clientY)
    const drag = dragRef.current

    if (drag.active) {
      const deltaX = point.x - drag.startPoint.x
      const deltaY = point.y - drag.startPoint.y
      const isSecondaryDrag = drag.button === 2
      const yawInfluence = isSecondaryDrag ? 0.82 : 1
      const pitchInfluence = isSecondaryDrag ? 1 : 0.84
      const yawDelta = deltaX * YAW_DRAG_SPEED * yawInfluence
      const pitchDelta = -deltaY * PITCH_DRAG_SPEED * pitchInfluence
      const now = performance.now()
      const elapsed = Math.max(16, now - drag.lastTimestamp)
      const frameDeltaX = point.x - drag.lastPoint.x
      const frameDeltaY = point.y - drag.lastPoint.y
      const hasMoved = dragRef.current.moved || Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD

      dragRef.current = {
        ...dragRef.current,
        lastPoint: point,
        lastTimestamp: now,
        moved: hasMoved,
      }
      if (hasMoved) {
        setIsDragging(true)
      }
      interactionUntilRef.current = now + INTERACTION_DECOR_FREEZE_MS
      orbitOffsetRef.current = {
        yaw: normalizeAngle(drag.startOrbit.yaw + yawDelta),
        pitch: normalizeAngle(drag.startOrbit.pitch + pitchDelta),
      }
      orbitVelocityRef.current = {
        yaw: (frameDeltaX * YAW_DRAG_SPEED * yawInfluence * 16 * DRAG_VELOCITY_BLEND) / elapsed,
        pitch:
          (-frameDeltaY * PITCH_DRAG_SPEED * pitchInfluence * 16 * DRAG_VELOCITY_BLEND) / elapsed,
      }
      onHover(null)
      return
    }

    const hoveredPoet = findProjectedPoetAtPoint(projectedPoetsRef.current, point, POINTER_HIT_PADDING)
    onHover(hoveredPoet?.id ?? null)
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current

    if (drag.pointerId !== event.pointerId) {
      return
    }

    if (!drag.moved) {
      const point = toCanvasPoint(event.clientX, event.clientY)
      if (drag.button === 2) {
        dragRef.current = initialDragState
        setIsDragging(false)
        event.currentTarget.releasePointerCapture(event.pointerId)
        return
      }
      const target =
        findProjectedPoetAtPoint(projectedPoetsRef.current, point, POINTER_HIT_PADDING) ??
        graph.poets.find((poet) => poet.id === drag.pressedTargetId)

      if (target) {
        onSelect(target.id)
      } else {
        onClear()
      }
    }

    interactionUntilRef.current = performance.now() + INTERACTION_DECOR_FREEZE_MS
    dragRef.current = initialDragState
    setIsDragging(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    interactionUntilRef.current = performance.now() + INTERACTION_DECOR_FREEZE_MS
    dragRef.current = initialDragState
    setIsDragging(false)
  }

  return (
    <section className="scene" ref={sceneRef}>
      <canvas aria-hidden="true" className="scene-background-canvas" ref={backgroundCanvasRef} />
      <div aria-hidden="true" className="scene-deep-stars" />
      <div aria-hidden="true" className="scene-galaxy-band" />
      <div aria-hidden="true" className="scene-galaxy-dust" />
      <canvas
        aria-label="诗人关系星图"
        className={`scene-canvas ${isDragging ? 'is-dragging' : ''}`}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerLeave={() => onHover(null)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        ref={canvasRef}
      />
    </section>
  )
}

function drawWarpBackground(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  stars: WarpStar[],
  delta: number,
) {
  context.fillStyle = 'rgba(3, 5, 15, 0.34)'
  context.fillRect(0, 0, size.width, size.height)

  const bloom = context.createRadialGradient(
    size.width * 0.5,
    size.height * 0.5,
    0,
    size.width * 0.5,
    size.height * 0.5,
    Math.max(size.width, size.height) * 0.45,
  )
  bloom.addColorStop(0, 'rgba(68, 110, 255, 0.08)')
  bloom.addColorStop(0.45, 'rgba(52, 88, 214, 0.04)')
  bloom.addColorStop(1, 'rgba(3, 5, 15, 0)')
  context.fillStyle = bloom
  context.fillRect(0, 0, size.width, size.height)

  for (const star of stars) {
    star.z -= star.speed * (delta / 16)

    if (star.z <= 1) {
      resetWarpStar(star, size, true)
    }

    const perspective = size.width / star.z
    const x = (star.x - size.width / 2) * perspective + size.width / 2
    const y = (star.y - size.height / 2) * perspective + size.height / 2
    const radius = Math.max(0.35, star.radius * perspective)

    if (x < -40 || x > size.width + 40 || y < -40 || y > size.height + 40) {
      resetWarpStar(star, size, true)
      continue
    }

    const trailDepth = Math.min(size.width, star.z + 34)
    const trailPerspective = size.width / trailDepth
    const trailX = (star.x - size.width / 2) * trailPerspective + size.width / 2
    const trailY = (star.y - size.height / 2) * trailPerspective + size.height / 2
    const alpha = Math.min(0.92, 0.14 + (1 - star.z / size.width) * 0.8)

    context.beginPath()
    context.strokeStyle = `rgba(210, 228, 255, ${alpha * 0.42})`
    context.lineWidth = Math.max(0.4, radius * 0.5)
    context.moveTo(trailX, trailY)
    context.lineTo(x, y)
    context.stroke()

    context.beginPath()
    context.fillStyle = `rgba(255, 255, 255, ${alpha})`
    context.shadowBlur = Math.min(18, radius * 6)
    context.shadowColor = 'rgba(196, 216, 255, 0.68)'
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
  }

  context.shadowBlur = 0
}

function drawAtmosphere(context: CanvasRenderingContext2D, size: CanvasSize, motion: SceneMotion) {
  const centerX = size.width * 0.5
  const centerY = size.height * 0.48
  const carrierPulse = 0.92 + Math.sin(motion.timestamp * 0.00038) * 0.08
  const bloom = context.createRadialGradient(
    centerX,
    centerY,
    0,
    centerX,
    centerY,
    size.width * motion.atmosphereRadiusScale * carrierPulse,
  )
  bloom.addColorStop(0, `rgba(204, 242, 255, ${0.18 + motion.atmosphereAlpha * 0.24})`)
  bloom.addColorStop(0.24, `rgba(132, 214, 255, ${0.12 + motion.atmosphereAlpha * 0.16})`)
  bloom.addColorStop(0.5, 'rgba(88, 160, 255, 0.08)')
  bloom.addColorStop(0.76, 'rgba(10, 20, 38, 0.04)')
  bloom.addColorStop(1, 'rgba(3, 8, 18, 0)')

  context.fillStyle = bloom
  context.fillRect(0, 0, size.width, size.height)

  const halo = context.createRadialGradient(
    centerX,
    centerY,
    size.width * 0.12,
    centerX,
    centerY,
    size.width * 0.76,
  )
  halo.addColorStop(0, 'rgba(120, 255, 248, 0)')
  halo.addColorStop(0.42, `rgba(120, 226, 255, ${0.05 + motion.membraneAlpha * 0.05})`)
  halo.addColorStop(0.78, 'rgba(12, 24, 40, 0.08)')
  halo.addColorStop(1, 'rgba(2, 8, 18, 0)')
  context.fillStyle = halo
  context.fillRect(0, 0, size.width, size.height)

  const membrane = context.createLinearGradient(
    size.width * (0.1 + motion.membraneShift),
    0,
    size.width * (0.9 - motion.membraneShift),
    size.height,
  )
  membrane.addColorStop(0, `rgba(8, 16, 30, ${0.52 + motion.membraneAlpha * 0.12})`)
  membrane.addColorStop(0.28, `rgba(26, 72, 118, ${0.12 + motion.membraneAlpha * 0.06})`)
  membrane.addColorStop(0.52, `rgba(22, 54, 92, ${0.08 + motion.membraneAlpha * 0.05})`)
  membrane.addColorStop(0.78, `rgba(10, 12, 24, ${0.24 + motion.membraneAlpha * 0.08})`)
  membrane.addColorStop(1, `rgba(2, 8, 18, ${0.48 + motion.membraneAlpha * 0.1})`)
  context.fillStyle = membrane
  context.fillRect(0, 0, size.width, size.height)
}

function drawDepthVeils(context: CanvasRenderingContext2D, size: CanvasSize, motion: SceneMotion) {
  const lobes = [
    {
      x: 0.18 + Math.sin(motion.timestamp * 0.00018) * 0.04,
      y: 0.24,
      radius: 0.3 * motion.fieldPulse,
      inner: 'rgba(124, 214, 255, 0.09)',
      outer: 'rgba(3, 18, 34, 0)',
    },
    {
      x: 0.82 + Math.cos(motion.timestamp * 0.00014) * 0.03,
      y: 0.28,
      radius: 0.24 * (0.94 + (motion.fieldPulse - 1) * 0.7),
      inner: 'rgba(110, 194, 255, 0.07)',
      outer: 'rgba(8, 14, 34, 0)',
    },
    {
      x: 0.5,
      y: 0.8 + Math.sin(motion.timestamp * 0.00011) * 0.025,
      radius: 0.34 * (0.92 + (motion.fieldPulse - 1) * 0.8),
      inner: 'rgba(156, 228, 255, 0.06)',
      outer: 'rgba(2, 10, 22, 0)',
    },
  ]

  for (const lobe of lobes) {
    const veil = context.createRadialGradient(
      size.width * lobe.x,
      size.height * lobe.y,
      0,
      size.width * lobe.x,
      size.height * lobe.y,
      size.width * lobe.radius,
    )
    veil.addColorStop(0, lobe.inner)
    veil.addColorStop(1, lobe.outer)
    context.fillStyle = veil
    context.beginPath()
    context.ellipse(
      size.width * lobe.x,
      size.height * lobe.y,
      size.width * lobe.radius,
      size.height * (lobe.radius * 0.72),
      0,
      0,
      Math.PI * 2,
    )
    context.fill()
  }
}

function drawSphereShell(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  rotation: number,
  pitch: number,
  motion: SceneMotion,
  zoomScale: number,
  reducedDetail: boolean,
) {
  const centerX = size.width / 2
  const centerY = size.height / 2
  const radius = getSphereRadius(size, zoomScale)
  const shell = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.08)
  shell.addColorStop(0, 'rgba(34, 92, 128, 0.16)')
  shell.addColorStop(0.5, 'rgba(14, 30, 60, 0.12)')
  shell.addColorStop(1, 'rgba(2, 8, 18, 0)')
  context.beginPath()
  context.fillStyle = shell
  context.arc(centerX, centerY, radius * 1.04, 0, Math.PI * 2)
  context.fill()

  const lightAngle = rotation * 0.52 - 0.84
  const lightX = Math.cos(lightAngle)
  const lightY = -Math.sin(lightAngle) * (0.72 + pitch * 0.18)

  context.save()
  context.beginPath()
  context.arc(centerX, centerY, radius, 0, Math.PI * 2)
  context.clip()

  const dayGlow = context.createRadialGradient(
    centerX + lightX * radius * 0.18,
    centerY + lightY * radius * 0.16,
    radius * 0.08,
    centerX + lightX * radius * 0.18,
    centerY + lightY * radius * 0.16,
    radius * 0.92,
  )
  dayGlow.addColorStop(0, `rgba(194, 250, 255, ${0.1 + (motion.clusterBreath - 1) * 0.18})`)
  dayGlow.addColorStop(0.2, `rgba(110, 245, 255, ${0.14 + (motion.clusterBreath - 1) * 0.16})`)
  dayGlow.addColorStop(0.52, 'rgba(80, 124, 255, 0.12)')
  dayGlow.addColorStop(1, 'rgba(3, 10, 20, 0)')
  context.fillStyle = dayGlow
  context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2)

  if (!reducedDetail) {
    drawLivingSurface(context, centerX, centerY, radius, rotation, pitch, motion)
  }

  const corePulse = 0.96 + Math.sin(motion.timestamp * 0.0022) * 0.08
  const core = context.createRadialGradient(
    centerX,
    centerY,
    radius * 0.04,
    centerX,
    centerY,
    radius * 0.62 * corePulse,
  )
  core.addColorStop(0, 'rgba(255, 255, 255, 0.42)')
  core.addColorStop(0.18, 'rgba(154, 255, 247, 0.26)')
  core.addColorStop(0.48, 'rgba(102, 171, 255, 0.16)')
  core.addColorStop(1, 'rgba(6, 18, 34, 0)')
  context.fillStyle = core
  context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2)

  const nightShade = context.createLinearGradient(
    centerX + lightX * radius,
    centerY + lightY * radius,
    centerX - lightX * radius,
    centerY - lightY * radius,
  )
  nightShade.addColorStop(0, 'rgba(0, 0, 0, 0)')
  nightShade.addColorStop(0.48, 'rgba(4, 14, 28, 0.1)')
  nightShade.addColorStop(0.7, 'rgba(2, 8, 18, 0.32)')
  nightShade.addColorStop(1, 'rgba(1, 6, 14, 0.5)')
  context.fillStyle = nightShade
  context.fillRect(centerX - radius * 1.2, centerY - radius * 1.2, radius * 2.4, radius * 2.4)
  context.restore()

  context.beginPath()
  context.strokeStyle = `rgba(152, 242, 255, ${0.16 + (motion.clusterBreath - 1) * 0.18})`
  context.lineWidth = 1.1
  context.arc(centerX, centerY, radius, 0, Math.PI * 2)
  context.stroke()

  context.beginPath()
  context.shadowBlur = 26
  context.shadowColor = 'rgba(122, 242, 255, 0.34)'
  context.strokeStyle = `rgba(120, 236, 255, ${0.16 + (motion.clusterBreath - 1) * 0.24})`
  context.lineWidth = 2
  context.arc(centerX, centerY, radius * 1.015, 0, Math.PI * 2)
  context.stroke()
  context.shadowBlur = 0

  const atmosphereRim = context.createLinearGradient(
    centerX + lightX * radius * 1.2,
    centerY + lightY * radius * 1.2,
    centerX - lightX * radius * 1.2,
    centerY - lightY * radius * 1.2,
  )
  atmosphereRim.addColorStop(0, 'rgba(188, 248, 255, 0.36)')
  atmosphereRim.addColorStop(0.38, 'rgba(118, 226, 255, 0.22)')
  atmosphereRim.addColorStop(1, 'rgba(78, 118, 255, 0.08)')
  context.beginPath()
  context.strokeStyle = atmosphereRim
  context.lineWidth = 5.2
  context.arc(centerX, centerY, radius * 1.025, 0, Math.PI * 2)
  context.stroke()

  if (reducedDetail) {
    return
  }

  const orbitPhase = motion.timestamp * 0.0002 + rotation * 0.25
  for (let index = 0; index < 3; index += 1) {
    context.beginPath()
    context.setLineDash(index === 1 ? [4, 10] : [10, 12])
    context.lineDashOffset = -motion.timestamp * (0.01 + index * 0.004)
    context.strokeStyle =
      index === 1
        ? `rgba(150, 232, 255, ${0.12 + motion.clusterLabelAlpha * 0.08})`
        : `rgba(112, 156, 255, ${0.1 + motion.clusterLabelAlpha * 0.06})`
    context.lineWidth = 0.9 + index * 0.2
    context.ellipse(
      centerX,
      centerY,
      radius * (0.42 + index * 0.08),
      radius * (0.1 + index * 0.028),
      orbitPhase + index * 0.92 + pitch * 0.16,
      0,
      Math.PI * 2,
    )
    context.stroke()
  }
  context.setLineDash([])

  const meridianPhase = rotation * 0.9
  for (let index = -1; index <= 1; index += 1) {
    const phase = meridianPhase + index * 1.15
    const meridianRadiusX = Math.abs(Math.cos(phase)) * radius

    context.beginPath()
    context.strokeStyle = `rgba(148, 210, 255, ${0.05 + Math.abs(Math.cos(phase)) * 0.06})`
    context.lineWidth = 0.8
    context.ellipse(centerX, centerY, Math.max(8, meridianRadiusX), radius, 0, 0, Math.PI * 2)
    context.stroke()
  }
}

function drawLivingSurface(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  rotation: number,
  pitch: number,
  motion: SceneMotion,
) {
  const cloudDrift = rotation * 0.72 + motion.timestamp * 0.000018

  for (let index = 0; index < 14; index += 1) {
    const phase = cloudDrift + index * 1.27
    const layer = index % 4
    const x = centerX + Math.cos(phase * (0.92 + layer * 0.06)) * radius * (0.14 + layer * 0.12)
    const y =
      centerY +
      Math.sin(phase * (1.18 + layer * 0.05) + pitch * 1.3) * radius * (0.08 + layer * 0.07)
    const cloud = context.createRadialGradient(
      x,
      y,
      radius * 0.02,
      x,
      y,
      radius * (0.08 + layer * 0.05),
    )
    cloud.addColorStop(0, `rgba(166, 247, 255, ${0.022 + layer * 0.007})`)
    cloud.addColorStop(0.5, `rgba(104, 142, 255, ${0.014 + layer * 0.005})`)
    cloud.addColorStop(1, 'rgba(4, 14, 24, 0)')
    context.fillStyle = cloud
    context.beginPath()
    context.ellipse(
      x,
      y,
      radius * (0.06 + layer * 0.024),
      radius * (0.03 + layer * 0.015),
      phase * 0.32,
      0,
      Math.PI * 2,
    )
    context.fill()
  }

  for (let filament = 0; filament < 10; filament += 1) {
    const filamentPhase = cloudDrift * (0.78 + filament * 0.03) + filament * 0.56
    context.beginPath()
    context.strokeStyle = `rgba(154, 232, 255, ${0.012 + (filament % 3) * 0.008})`
    context.lineWidth = 0.6 + (filament % 4) * 0.2
    context.ellipse(
      centerX + Math.cos(filamentPhase) * radius * 0.02,
      centerY + Math.sin(filamentPhase * 0.8 + pitch) * radius * 0.04,
      radius * (0.38 + (filament % 3) * 0.08),
      radius * (0.1 + (filament % 4) * 0.02),
      filamentPhase * 0.34,
      Math.PI * 0.08,
      Math.PI * 0.92,
    )
    context.stroke()
  }

  for (let tract = 0; tract < 11; tract += 1) {
    const phase = cloudDrift * (0.84 + tract * 0.022) + tract * 0.73
    const latBase = Math.sin(phase * 0.8 + pitch * 0.6) * 0.56
    const lonBase = phase * 0.82
    const visiblePoints: Array<{ x: number; y: number; z: number }> = []

    context.beginPath()
    for (let step = 0; step <= 26; step += 1) {
      const t = step / 26
      const latitude =
        latBase +
        Math.sin(t * Math.PI * 2 + phase) * 0.08 +
        Math.sin(t * Math.PI * 5 + phase * 0.7) * 0.025
      const longitude = lonBase + (t - 0.5) * 1.7 + Math.cos(t * Math.PI * 4 + tract) * 0.09
      const point = projectSurfacePoint(centerX, centerY, radius, latitude, longitude, rotation, pitch)

      if (point.z < -0.1) {
        continue
      }

      visiblePoints.push(point)
      if (visiblePoints.length === 1) {
        context.moveTo(point.x, point.y)
      } else {
        context.lineTo(point.x, point.y)
      }
    }

    if (visiblePoints.length > 1) {
      const head = visiblePoints[0]
      const tail = visiblePoints[visiblePoints.length - 1]
      const meanFrontness =
        visiblePoints.reduce((sum, point) => sum + point.z, 0) / visiblePoints.length / 2 + 0.5
      const nerveGradient = context.createLinearGradient(head.x, head.y, tail.x, tail.y)
      nerveGradient.addColorStop(0, `rgba(92, 154, 255, ${0.05 + meanFrontness * 0.06})`)
      nerveGradient.addColorStop(0.5, `rgba(176, 252, 255, ${0.1 + meanFrontness * 0.12})`)
      nerveGradient.addColorStop(1, `rgba(90, 230, 255, ${0.04 + meanFrontness * 0.06})`)
      context.strokeStyle = nerveGradient
      context.lineWidth = 0.7 + meanFrontness * 0.95
      context.shadowBlur = 12
      context.shadowColor = 'rgba(110, 255, 228, 0.12)'
      context.stroke()

      for (let synapse = 2; synapse < visiblePoints.length; synapse += 5) {
        const point = visiblePoints[synapse]
        context.beginPath()
        context.fillStyle = `rgba(208, 255, 248, ${0.08 + meanFrontness * 0.09})`
        context.arc(point.x, point.y, 0.7 + meanFrontness * 1.15, 0, Math.PI * 2)
        context.fill()
      }
    }
  }

  context.shadowBlur = 0

  for (let mote = 0; mote < 20; mote += 1) {
    const motePhase = cloudDrift * (1.1 + mote * 0.01) + mote * 0.41
    const moteX = centerX + Math.cos(motePhase) * radius * (0.12 + (mote % 5) * 0.12)
    const moteY = centerY + Math.sin(motePhase * 1.28 + pitch) * radius * (0.05 + (mote % 4) * 0.09)
    context.beginPath()
    context.fillStyle = `rgba(190, 246, 255, ${0.016 + (mote % 4) * 0.005})`
    context.arc(moteX, moteY, 0.7 + (mote % 3) * 0.25, 0, Math.PI * 2)
    context.fill()
  }
}

function drawStars(
  context: CanvasRenderingContext2D,
  stars: ReturnType<typeof createBackgroundStars>,
  size: CanvasSize,
  pan: CanvasPoint,
  motion: SceneMotion,
) {
  for (const star of stars) {
    const twinkle = 0.6 + Math.sin(motion.timestamp * 0.0011 + star.phase) * 0.18 + motion.starTwinkle
    const x = star.x * size.width + pan.x * star.depth * 0.05
    const y = star.y * size.height + pan.y * star.depth * 0.05

    context.beginPath()
    context.fillStyle =
      star.depth > 0.8
        ? `rgba(116, 255, 226, ${twinkle})`
        : `rgba(183, 235, 255, ${twinkle * 0.8})`
    context.shadowBlur = 18 * star.depth
    context.shadowColor =
      star.depth > 0.8 ? 'rgba(78, 255, 214, 0.7)' : 'rgba(131, 217, 255, 0.48)'
    context.arc(x, y, star.radius, 0, Math.PI * 2)
    context.fill()
  }

  context.shadowBlur = 0
}

function drawEdges(
  context: CanvasRenderingContext2D,
  relations: PoetGraph['relations'],
  projectedById: ReadonlyMap<string, SphereProjectedPoet>,
  selectedId: string | null,
  motion: SceneMotion,
  size: CanvasSize,
  viewport: { pan: CanvasPoint },
  zoomScale: number,
) {
  for (const relation of relations) {
    const source = projectedById.get(relation.source)
    const target = projectedById.get(relation.target)

    if (!source || !target) {
      continue
    }

    const meanFrontness = (source.frontness + target.frontness) / 2

    if (!selectedId && meanFrontness < 0.16) {
      continue
    }

    const pulse = 0.45 + Math.sin(motion.timestamp * 0.0022 + relation.intensity * 6) * 0.14 + motion.edgePulse
    const baseAlpha = relation.type === 'gift' ? 0.22 : 0.11
    const alpha = (selectedId ? pulse + 0.34 : baseAlpha + pulse * 0.16) * (0.34 + meanFrontness * 0.92)
    const curve = buildSphereCurve(source, target, size, viewport, zoomScale)
    context.beginPath()
    context.setLineDash(relation.type === 'gift' ? [10, 12] : [4, 16])
    context.lineDashOffset = -motion.timestamp * (relation.type === 'gift' ? 0.02 : 0.01)
    context.lineWidth = selectedId ? 2.6 : relation.type === 'gift' ? 1.1 : 0.8
    context.strokeStyle =
      relation.type === 'gift'
        ? `rgba(120, 255, 224, ${alpha})`
        : `rgba(128, 192, 255, ${alpha * 0.88})`
    context.shadowBlur = selectedId ? 12 : 0
    context.shadowColor =
      relation.type === 'gift' ? 'rgba(97, 255, 224, 0.28)' : 'rgba(105, 192, 255, 0.22)'
    context.moveTo(curve.start.x, curve.start.y)
    context.bezierCurveTo(
      curve.control1.x,
      curve.control1.y,
      curve.control2.x,
      curve.control2.y,
      curve.end.x,
      curve.end.y,
    )
    context.stroke()

    const pulseProgress =
      (motion.timestamp * (relation.type === 'gift' ? 0.00016 : 0.00008) + relation.intensity) % 1
    const pulsePoint = sampleCubicBezier(curve, pulseProgress)

    context.beginPath()
    context.fillStyle =
      relation.type === 'gift'
        ? `rgba(170, 255, 223, ${Math.min(1, alpha + 0.12)})`
        : `rgba(161, 193, 255, ${Math.min(1, alpha + 0.08)})`
    context.shadowBlur = selectedId ? 12 : 0
    context.shadowColor = relation.type === 'gift' ? 'rgba(96, 255, 216, 0.8)' : 'rgba(128, 176, 255, 0.6)'
    context.arc(pulsePoint.x, pulsePoint.y, selectedId ? 2.4 : 1.5, 0, Math.PI * 2)
    context.fill()
  }

  context.setLineDash([])
  context.shadowBlur = 0
}

function buildAmbientRelations(graph: PoetGraph) {
  const picked = []
  const counts = new Map<string, number>()

  for (const relation of [...graph.relations].sort((left, right) => right.intensity - left.intensity)) {
    const sourceCount = counts.get(relation.source) ?? 0
    const targetCount = counts.get(relation.target) ?? 0
    const shouldKeep =
      relation.intensity >= 0.95 ||
      sourceCount < AMBIENT_PER_POET_LIMIT ||
      targetCount < AMBIENT_PER_POET_LIMIT

    if (!shouldKeep) {
      continue
    }

    picked.push(relation)
    counts.set(relation.source, sourceCount + 1)
    counts.set(relation.target, targetCount + 1)

    if (picked.length >= AMBIENT_EDGE_LIMIT) {
      break
    }
  }

  return picked
}

function indexProjectedPoets(projected: readonly SphereProjectedPoet[]) {
  return new Map(projected.map((item) => [item.poet.id, item]))
}

function drawNodes(
  context: CanvasRenderingContext2D,
  projected: SphereProjectedPoet[],
  selectedId: string | null,
  connectedIds: Set<string>,
  hoveredId: string | null,
  motion: SceneMotion,
) {
  const sorted = [...projected].sort((left, right) => left.poet.depth - right.poet.depth)

  for (const item of sorted) {
    const isSelected = item.poet.id === selectedId
    const isHovered = item.poet.id === hoveredId
    const isRelated = selectedId ? connectedIds.has(item.poet.id) : false
    const fade = selectedId
      ? !isSelected && !isRelated
        ? 0.16
        : 1
      : 1
    const glowRadius = item.radius * (isSelected ? 5 : isHovered ? 4.2 : 3.2)
    const pulseScale =
      (isSelected ? 1.16 : isHovered ? 1.06 : 1) *
      (isSelected ? motion.nodePulseScale : isHovered ? 1 + (motion.nodePulseScale - 1) * 0.6 : 1 + (motion.nodePulseScale - 1) * 0.28)
    const haloScale =
      (isSelected ? 3.4 : isHovered ? 2.5 : isRelated ? 2.2 : 1.9) *
      motion.nodeHaloScale

    context.beginPath()
    context.fillStyle = isSelected
      ? `rgba(92, 255, 220, ${0.16 * fade})`
      : `rgba(102, 201, 255, ${0.08 * fade})`
    context.shadowBlur = isSelected || isHovered ? glowRadius : glowRadius * 0.55
    context.shadowColor = isSelected
        ? 'rgba(102, 255, 224, 0.95)'
        : isHovered
          ? 'rgba(126, 221, 255, 0.92)'
          : 'rgba(80, 173, 255, 0.52)'
    context.arc(item.x, item.y, item.radius * haloScale * pulseScale, 0, Math.PI * 2)
    context.fill()

    context.beginPath()
    context.fillStyle = isSelected
      ? `rgba(216, 255, 246, ${item.opacity * fade})`
      : `rgba(209, 241, 255, ${item.opacity * fade})`
    context.arc(item.x, item.y, item.radius, 0, Math.PI * 2)
    context.fill()

    context.beginPath()
    context.strokeStyle = isSelected
      ? `rgba(163, 255, 233, ${0.65 * fade})`
      : `rgba(140, 202, 255, ${0.2 * fade})`
    context.lineWidth = isSelected ? 1.3 : 0.8
    context.arc(item.x, item.y, item.radius * (isSelected ? 1.8 : 1.45), 0, Math.PI * 2)
    context.stroke()

    if (isSelected || isHovered || isRelated) {
      context.beginPath()
      context.strokeStyle = isSelected
        ? `rgba(121, 255, 221, ${0.34 * fade})`
        : `rgba(126, 209, 255, ${0.18 * fade})`
      context.lineWidth = isSelected ? 1.1 : 0.7
      context.arc(
        item.x,
        item.y,
        item.radius * (isSelected ? 3.1 : 2.2) * motion.ringPulseScale,
        0,
        Math.PI * 2,
      )
      context.stroke()
    }

    context.shadowBlur = 0

    if (isSelected || isHovered) {
      context.font = `${Math.round(12 + item.poet.depth * 5)}px "Noto Serif SC", "STSong", serif`
      context.textAlign = 'center'
      context.fillStyle = `rgba(230, 251, 255, ${Math.max(0.7, item.opacity * fade)})`
      context.fillText(item.poet.name, item.x, item.y + item.radius + 22)
    }
  }
}

function drawSelectionPulse(
  context: CanvasRenderingContext2D,
  projected: SphereProjectedPoet[],
  selectedId: string | null,
  connectedIds: Set<string>,
  motion: SceneMotion,
  selectionPulse: { id: string | null; start: number },
  size: CanvasSize,
  viewport: { pan: CanvasPoint },
  zoomScale: number,
) {
  if (!selectedId) {
    return
  }

  const selected = projected.find((item) => item.poet.id === selectedId)

  if (!selected) {
    return
  }

  const pulseElapsed =
    selectionPulse.id === selectedId ? motion.timestamp - selectionPulse.start : Number.POSITIVE_INFINITY
  const membraneProgress =
    pulseElapsed < 0 || !Number.isFinite(pulseElapsed) ? 1 : clamp01(pulseElapsed / 2100)

  const connected = projected
    .filter((item) => connectedIds.has(item.poet.id))
    .sort((left, right) => {
      const leftDistance = Math.hypot(left.x - selected.x, left.y - selected.y)
      const rightDistance = Math.hypot(right.x - selected.x, right.y - selected.y)
      return leftDistance - rightDistance || right.frontness - left.frontness
    })
    .slice(0, 8)

  const baseRadius = selected.radius * 4.4
  const waveOffsets = [0, 0.34, 0.68]

  for (const offset of waveOffsets) {
    const progress = (motion.timestamp * 0.00028 + offset) % 1
    const radius = baseRadius + progress * selected.radius * 18
    const alpha = (1 - progress) * 0.22

    context.beginPath()
    context.strokeStyle = `rgba(118, 255, 228, ${alpha})`
    context.lineWidth = 1.8 - progress * 0.9
    context.shadowBlur = 18
    context.shadowColor = 'rgba(102, 255, 224, 0.35)'
    context.arc(selected.x, selected.y, radius, 0, Math.PI * 2)
    context.stroke()
  }

  context.shadowBlur = 0

  if (membraneProgress < 1) {
    const membraneRadius = selected.radius * (8 + membraneProgress * 22)
    const membraneAlpha = (1 - membraneProgress) * 0.2
    const membraneGlow = context.createRadialGradient(
      selected.x,
      selected.y,
      selected.radius * 2,
      selected.x,
      selected.y,
      membraneRadius,
    )
    membraneGlow.addColorStop(0, `rgba(124, 255, 232, ${membraneAlpha * 0.9})`)
    membraneGlow.addColorStop(0.52, `rgba(92, 214, 255, ${membraneAlpha * 0.5})`)
    membraneGlow.addColorStop(1, 'rgba(8, 18, 30, 0)')
    context.beginPath()
    context.fillStyle = membraneGlow
    context.arc(selected.x, selected.y, membraneRadius, 0, Math.PI * 2)
    context.fill()
  }

  const neighborhood = connected
    .map((target) => {
      const dx = target.x - selected.x
      const dy = target.y - selected.y
      const distance = Math.hypot(dx, dy) || 1
      const anchorMix = 0.72 + Math.min(0.12, (selected.radius * 1.8) / distance)
      return {
        angle: Math.atan2(dy, dx),
        anchor: {
          x: selected.x + dx * anchorMix,
          y: selected.y + dy * anchorMix,
        },
        distance,
        target,
      }
    })
    .sort((left, right) => left.angle - right.angle)

  if (neighborhood.length >= 2) {
    const membraneRadius = Math.max(...neighborhood.map((item) => item.distance * 0.84), selected.radius * 9)
    const localMembrane = context.createRadialGradient(
      selected.x,
      selected.y,
      selected.radius * 2.1,
      selected.x,
      selected.y,
      membraneRadius,
    )
    localMembrane.addColorStop(0, `rgba(100, 255, 228, ${0.05 + (1 - membraneProgress) * 0.08})`)
    localMembrane.addColorStop(0.52, `rgba(84, 188, 255, ${0.025 + (1 - membraneProgress) * 0.07})`)
    localMembrane.addColorStop(1, 'rgba(4, 10, 18, 0)')

    context.beginPath()
    context.fillStyle = localMembrane
    context.arc(selected.x, selected.y, membraneRadius, 0, Math.PI * 2)
    context.fill()

    for (let index = 0; index < neighborhood.length; index += 1) {
      const current = neighborhood[index]
      const next = neighborhood[(index + 1) % neighborhood.length]
      const midX = (current.anchor.x + next.anchor.x) / 2
      const midY = (current.anchor.y + next.anchor.y) / 2
      const liftX = midX - selected.x
      const liftY = midY - selected.y
      const liftLength = Math.hypot(liftX, liftY) || 1
      const control = {
        x: midX + (liftX / liftLength) * (16 + (1 - membraneProgress) * 12),
        y: midY + (liftY / liftLength) * (16 + (1 - membraneProgress) * 12),
      }
      const segmentProgress = clamp01((membraneProgress - index * 0.075) / 0.22)

      context.beginPath()
      context.strokeStyle = `rgba(120, 255, 231, ${0.06 + (1 - membraneProgress) * 0.12})`
      context.lineWidth = 1.15
      context.moveTo(current.anchor.x, current.anchor.y)
      context.quadraticCurveTo(control.x, control.y, next.anchor.x, next.anchor.y)
      context.stroke()

      if (segmentProgress <= 0) {
        continue
      }

      for (let trailIndex = 0; trailIndex < 6; trailIndex += 1) {
        const trailProgress = clamp01(segmentProgress - trailIndex * 0.06)
        const point = sampleQuadraticBezier(current.anchor, control, next.anchor, trailProgress)
        const alpha = (1 - trailIndex / 6) * (0.36 + (1 - membraneProgress) * 0.34)
        const radius = 1.5 + (1 - trailIndex / 6) * 2

        context.beginPath()
        context.fillStyle = `rgba(181, 255, 240, ${alpha})`
        context.shadowBlur = 12
        context.shadowColor = 'rgba(110, 255, 222, 0.74)'
        context.arc(point.x, point.y, radius, 0, Math.PI * 2)
        context.fill()
      }
    }
  }

  for (const [index, item] of neighborhood.entries()) {
    const target = item.target
    const curve = buildSphereCurve(selected, target, size, viewport, zoomScale)
    const delay = index * 0.08
    const travelProgress =
      membraneProgress < 1
        ? clamp01((membraneProgress - delay) / 0.24)
        : (motion.timestamp * 0.00042 + target.poet.depth * 0.21) % 1
    const headAlpha = membraneProgress < 1 ? 0.78 - membraneProgress * 0.18 : 0.34
    const impactProgress = clamp01((membraneProgress - delay - 0.08) / 0.22)

    context.beginPath()
    context.strokeStyle = `rgba(110, 255, 230, ${0.07 + (1 - membraneProgress) * 0.12})`
    context.lineWidth = 1.05
    context.setLineDash([3, 10])
    context.lineDashOffset = -motion.timestamp * 0.012
    context.moveTo(curve.start.x, curve.start.y)
    context.bezierCurveTo(
      curve.control1.x,
      curve.control1.y,
      curve.control2.x,
      curve.control2.y,
      curve.end.x,
      curve.end.y,
    )
    context.stroke()

    for (let trailIndex = 0; trailIndex < 7; trailIndex += 1) {
      const trailProgress = clamp01(travelProgress - trailIndex * 0.045)
      const point = sampleCubicBezier(curve, trailProgress)
      const alpha = (1 - trailIndex / 7) * headAlpha
      const radius = 1.4 + (1 - trailIndex / 7) * 2.4

      context.beginPath()
      context.fillStyle = `rgba(178, 255, 238, ${alpha})`
      context.shadowBlur = 14
      context.shadowColor = 'rgba(110, 255, 222, 0.8)'
      context.arc(point.x, point.y, radius, 0, Math.PI * 2)
      context.fill()
    }

    if (impactProgress > 0) {
      const impactRadius = target.radius * (2.8 + impactProgress * 4.8)
      const impactGlow = context.createRadialGradient(
        target.x,
        target.y,
        target.radius * 0.4,
        target.x,
        target.y,
        impactRadius,
      )
      impactGlow.addColorStop(0, `rgba(206, 255, 245, ${0.34 + (1 - impactProgress) * 0.24})`)
      impactGlow.addColorStop(0.36, `rgba(116, 255, 228, ${0.16 + (1 - impactProgress) * 0.22})`)
      impactGlow.addColorStop(1, 'rgba(6, 14, 24, 0)')
      context.beginPath()
      context.fillStyle = impactGlow
      context.arc(target.x, target.y, impactRadius, 0, Math.PI * 2)
      context.fill()
    }
  }

  context.setLineDash([])
  context.shadowBlur = 0
}

function drawDynastyClusters(
  context: CanvasRenderingContext2D,
  projected: SphereProjectedPoet[],
  motion: SceneMotion,
) {
  const grouped = new Map<string, SphereProjectedPoet[]>()

  for (const item of projected) {
    const bucket = grouped.get(item.poet.dynasty) ?? []
    bucket.push(item)
    grouped.set(item.poet.dynasty, bucket)
  }

  for (const [dynasty, items] of grouped) {
    if (items.length < 2) {
      continue
    }

    const centerX = items.reduce((sum, item) => sum + item.x, 0) / items.length
    const centerY = items.reduce((sum, item) => sum + item.y, 0) / items.length
    const width =
      Math.max(...items.map((item) => Math.abs(item.x - centerX) + item.radius * 2.8), 120) *
      2.1 *
      motion.clusterBreath
    const height =
      Math.max(...items.map((item) => Math.abs(item.y - centerY) + item.radius * 2.6), 90) *
      2 *
      (0.98 + (motion.clusterBreath - 1) * 0.8)

    const membrane = context.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      Math.max(width, height) * 0.58,
    )
    membrane.addColorStop(0, `rgba(92, 255, 220, ${0.04 + (motion.clusterBreath - 1) * 0.12})`)
    membrane.addColorStop(0.52, `rgba(82, 168, 255, ${0.02 + (motion.clusterBreath - 1) * 0.08})`)
    membrane.addColorStop(1, 'rgba(5, 12, 22, 0)')

    context.beginPath()
    context.fillStyle = membrane
    context.ellipse(centerX, centerY, width / 2, height / 2, 0, 0, Math.PI * 2)
    context.fill()

    context.beginPath()
    context.strokeStyle = `rgba(122, 234, 255, ${0.05 + (motion.clusterBreath - 1) * 0.18})`
    context.lineWidth = 1
    context.setLineDash([10, 18])
    context.ellipse(centerX, centerY, width / 2, height / 2, 0, 0, Math.PI * 2)
    context.stroke()
    context.setLineDash([])

    context.font = '12px "Noto Serif SC", "STSong", serif'
    context.textAlign = 'center'
    context.fillStyle = `rgba(154, 230, 244, ${motion.clusterLabelAlpha})`
    context.fillText(`${dynasty} · 诗群`, centerX, centerY - height / 2 - 10)
  }
}

function breathe(timestamp: number, speed: number, amplitude: number) {
  return Math.sin(timestamp * speed) * amplitude
}

function createWarpStars(size: CanvasSize, count: number) {
  return Array.from({ length: count }, () => {
    const star: WarpStar = {
      radius: 0.3,
      speed: 1,
      x: 0,
      y: 0,
      z: 1,
    }

    resetWarpStar(star, size, false)
    return star
  })
}

function resolveWarpStarCount(size: CanvasSize) {
  return Math.max(280, Math.min(820, Math.round((size.width * size.height) / 3200)))
}

function resetWarpStar(star: WarpStar, size: CanvasSize, nearViewport: boolean) {
  star.x = Math.random() * size.width
  star.y = Math.random() * size.height
  star.z = nearViewport ? size.width * (0.72 + Math.random() * 0.28) : Math.random() * size.width
  star.radius = Math.random() * 1.1 + 0.22
  star.speed = 0.8 + Math.random() * 1.3
}

function projectPoetOnSphere(
  poet: PoetNode,
  viewport: { pan: CanvasPoint },
  size: CanvasSize,
  rotation: number,
  pitch: number,
  zoomScale: number,
): SphereProjectedPoet {
  const latitude = poet.position.y * Math.PI * 0.52
  const longitude = poet.position.x * Math.PI * 0.9
  const cosLat = Math.cos(latitude)
  const rotated = rotateSphereVector(
    {
      x: Math.sin(longitude) * cosLat,
      y: Math.sin(latitude),
      z: Math.cos(longitude) * cosLat,
    },
    rotation,
    pitch,
  )
  const sphereX = rotated.x
  const sphereY = rotated.y
  const sphereZ = rotated.z
  const frontness = (sphereZ + 1) / 2
  const radius = getSphereRadius(size, zoomScale)
  const parallax = 0.34 + frontness * 0.52
  const nodeScale = Math.pow(zoomScale, 0.88)

  return {
    frontness,
    opacity: 0.18 + frontness * 0.72 + poet.fame * 0.1,
    poet: {
      ...poet,
      depth: 0.28 + frontness * 0.68,
    },
    radius: (3 + poet.fame * 6 + frontness * 4) * nodeScale,
    sphereX,
    sphereY,
    sphereZ,
    x: size.width / 2 + sphereX * radius + viewport.pan.x * parallax,
    y: size.height / 2 + sphereY * radius + viewport.pan.y * parallax,
  }
}

function getFrontFacingRotation(poet: PoetNode) {
  return -poet.position.x * Math.PI * 0.9
}

function getFrontFacingPitch(poet: PoetNode) {
  return normalizeAngle(-poet.position.y * Math.PI * 0.46)
}

function buildSphereCurve(
  source: SphereProjectedPoet,
  target: SphereProjectedPoet,
  size: CanvasSize,
  viewport: { pan: CanvasPoint },
  zoomScale: number,
) {
  const start = { x: source.x, y: source.y }
  const end = { x: target.x, y: target.y }
  const midpoint = normalizeVector3({
    x: source.sphereX + target.sphereX,
    y: source.sphereY + target.sphereY,
    z: source.sphereZ + target.sphereZ,
  })
  const arcLift = 1.06 + Math.hypot(source.sphereX - target.sphereX, source.sphereY - target.sphereY) * 0.18
  const crest = normalizeVector3({
    x: midpoint.x * arcLift,
    y: midpoint.y * arcLift,
    z: midpoint.z * arcLift,
  })
  const control1 = projectSphereVector(lerpSpherePoint(source, crest, 0.42), size, viewport, zoomScale)
  const control2 = projectSphereVector(lerpSpherePoint(target, crest, 0.42), size, viewport, zoomScale)

  return {
    control1,
    control2,
    end,
    start,
  }
}

function lerpSpherePoint(
  from: { sphereX: number; sphereY: number; sphereZ: number; x: number; y: number },
  to: { x: number; y: number; z: number },
  t: number,
) {
  return normalizeVector3({
    x: from.sphereX + (to.x - from.sphereX) * t,
    y: from.sphereY + (to.y - from.sphereY) * t,
    z: from.sphereZ + (to.z - from.sphereZ) * t,
  })
}

function projectSphereVector(
  vector: { x: number; y: number; z: number },
  size: CanvasSize,
  viewport: { pan: CanvasPoint },
  zoomScale: number,
) {
  const frontness = (vector.z + 1) / 2
  const radius = getSphereRadius(size, zoomScale)
  const parallax = 0.34 + frontness * 0.52
  return {
    x: size.width / 2 + vector.x * radius + viewport.pan.x * parallax,
    y: size.height / 2 + vector.y * radius + viewport.pan.y * parallax,
  }
}

function getSphereRadius(size: CanvasSize, zoomScale: number) {
  return Math.min(size.width, size.height) * 0.31 * zoomScale
}

function projectSurfacePoint(
  centerX: number,
  centerY: number,
  radius: number,
  latitude: number,
  longitude: number,
  rotation: number,
  pitch: number,
) {
  const cosLat = Math.cos(latitude)
  const rotated = rotateSphereVector(
    {
      x: Math.sin(longitude) * cosLat,
      y: Math.sin(latitude),
      z: Math.cos(longitude) * cosLat,
    },
    rotation,
    pitch,
  )

  return {
    x: centerX + rotated.x * radius,
    y: centerY + rotated.y * radius,
    z: rotated.z,
  }
}

function normalizeVector3(vector: { x: number; y: number; z: number }) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  }
}

function sampleCubicBezier(
  curve: {
    control1: { x: number; y: number }
    control2: { x: number; y: number }
    end: { x: number; y: number }
    start: { x: number; y: number }
  },
  t: number,
) {
  const oneMinusT = 1 - t
  return {
    x:
      oneMinusT ** 3 * curve.start.x +
      3 * oneMinusT ** 2 * t * curve.control1.x +
      3 * oneMinusT * t ** 2 * curve.control2.x +
      t ** 3 * curve.end.x,
    y:
      oneMinusT ** 3 * curve.start.y +
      3 * oneMinusT ** 2 * t * curve.control1.y +
      3 * oneMinusT * t ** 2 * curve.control2.y +
      t ** 3 * curve.end.y,
  }
}

function sampleQuadraticBezier(
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  t: number,
) {
  const oneMinusT = 1 - t
  return {
    x: oneMinusT ** 2 * start.x + 2 * oneMinusT * t * control.x + t ** 2 * end.x,
    y: oneMinusT ** 2 * start.y + 2 * oneMinusT * t * control.y + t ** 2 * end.y,
  }
}

function rotateSphereVector(
  vector: { x: number; y: number; z: number },
  yaw: number,
  pitch: number,
) {
  const yawCos = Math.cos(yaw)
  const yawSin = Math.sin(yaw)
  const xYaw = vector.x * yawCos + vector.z * yawSin
  const zYaw = vector.z * yawCos - vector.x * yawSin
  const pitchCos = Math.cos(pitch)
  const pitchSin = Math.sin(pitch)

  return {
    x: xYaw,
    y: vector.y * pitchCos - zYaw * pitchSin,
    z: zYaw * pitchCos + vector.y * pitchSin,
  }
}

function normalizeAngle(value: number) {
  const fullTurn = Math.PI * 2
  let normalized = (value + Math.PI) % fullTurn

  if (normalized < 0) {
    normalized += fullTurn
  }

  return normalized - Math.PI
}

function blendAngle(current: number, target: number, factor: number) {
  return normalizeAngle(current + normalizeAngle(target - current) * factor)
}

function clampZoom(value: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value))
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function getSceneMotion(timestamp: number): SceneMotion {
  return {
    ambientDriftX: Math.cos(timestamp * 0.00012) * 16,
    ambientDriftY: Math.sin(timestamp * 0.00009) * 12,
    atmosphereAlpha: 0.12 + breathe(timestamp, 0.00052, 0.035),
    atmosphereRadiusScale: 0.48 + breathe(timestamp, 0.0004, 0.06),
    clusterBreath: 0.96 + breathe(timestamp, 0.00034, 0.08),
    clusterLabelAlpha: 0.38 + breathe(timestamp, 0.00042, 0.08),
    edgePulse: breathe(timestamp, 0.0014, 0.06),
    fieldPulse: 0.9 + breathe(timestamp, 0.00036, 0.1),
    membraneAlpha: 0.5 + breathe(timestamp, 0.00031, 0.12),
    membraneShift: Math.sin(timestamp * 0.00023) * 0.03,
    nodeHaloScale: 1 + breathe(timestamp, 0.00072, 0.04),
    nodePulseScale: 1 + breathe(timestamp, 0.0009, 0.06),
    ringPulseScale: 0.98 + breathe(timestamp, 0.00078, 0.04),
    starTwinkle: breathe(timestamp, 0.00024, 0.04),
    timestamp,
  }
}

function buildRelationIndex(relations: PoetGraph['relations']) {
  const byPoet = new Map<string, PoetGraph['relations']>()
  const neighbors = new Map<string, Set<string>>()

  for (const relation of relations) {
    const sourceRelations = byPoet.get(relation.source) ?? []
    sourceRelations.push(relation)
    byPoet.set(relation.source, sourceRelations)

    const targetRelations = byPoet.get(relation.target) ?? []
    targetRelations.push(relation)
    byPoet.set(relation.target, targetRelations)

    const sourceNeighbors = neighbors.get(relation.source) ?? new Set<string>()
    sourceNeighbors.add(relation.target)
    neighbors.set(relation.source, sourceNeighbors)

    const targetNeighbors = neighbors.get(relation.target) ?? new Set<string>()
    targetNeighbors.add(relation.source)
    neighbors.set(relation.target, targetNeighbors)
  }

  return { byPoet, neighbors }
}
