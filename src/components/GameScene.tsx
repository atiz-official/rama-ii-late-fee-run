import { ContactShadows, PerspectiveCamera, RoundedBox, Text, useAnimations, useGLTF, useKeyboardControls } from '@react-three/drei'
import { Bloom, EffectComposer, SMAA, Vignette } from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { Group, MathUtils, Mesh, MeshStandardMaterial, PerspectiveCamera as ThreePerspectiveCamera, Vector3 } from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { FINISH_Z, RUN_SECONDS, useGameStore, type GameStatus, type Objectives } from '../game/store'
import { traffic } from '../game/traffic'

const LANE_WIDTH = 4.1
const ROAD_WIDTH = 14.5
const ROAD_EDGE_LIMIT = ROAD_WIDTH / 2 - 1.55
const SHOULDER_STRESS_LIMIT = ROAD_WIDTH / 2 - 2.4
const CAMERA_OFFSET = new Vector3(0, 3.35, -7.4)
const DEMO_MODE = new URLSearchParams(window.location.search).get('demo') === '1'
const CAFE_STOP_ZONE = FINISH_Z * 0.72

type PlayerState = {
  x: number
  z: number
  speed: number
  stress: number
  timeLeft: number
  stuckTime: number
  score: number
  combo: number
  collisions: number
  collisionCooldown: number
  shake: number
  message: string
  routePhase: string
  cleanStreak: number
  runTime: number
  cafesSeen: Set<string>
  nearMisses: Set<string>
}

function laneX(lane: -1 | 0 | 1) {
  return lane * LANE_WIDTH
}

function trafficZ(baseZ: number, speed: number, elapsed: number) {
  const loopLength = FINISH_Z + 160
  return ((baseZ + elapsed * speed - 15) % loopLength) + 15
}

function freshPlayer(): PlayerState {
  return {
    x: 0,
    z: 0,
    speed: 0,
    stress: 12,
    timeLeft: RUN_SECONDS,
    stuckTime: 0,
    score: 0,
    combo: 1,
    collisions: 0,
    collisionCooldown: 0,
    shake: 0,
    message: 'Cruise and look for the right cafe.',
    routePhase: 'Thong Lo morning cruise',
    cleanStreak: 0,
    runTime: 0,
    cafesSeen: new Set<string>(),
    nearMisses: new Set<string>(),
  }
}

function routePhaseFor(z: number) {
  if (z > FINISH_Z * 0.78) return 'Quiet cafe terrace'
  if (z > FINISH_Z * 0.58) return 'Community mall cafes'
  if (z > FINISH_Z * 0.34) return 'Soi 55 brunch row'
  if (z > FINISH_Z * 0.16) return 'Condo and cafe lane'
  return 'Thong Lo morning cruise'
}

export function GameScene() {
  const stage = useGameStore((state) => state.stage)

  if (stage === 'nursery') return <NurseryRushScene />

  return <RoadRunScene />
}

function RoadRunScene() {
  const player = useRef<PlayerState>(freshPlayer())
  const ev = useRef<Group>(null)
  const cameraRig = useRef<ThreePerspectiveCamera>(null)
  const [, getKeys] = useKeyboardControls()
  const setTelemetry = useGameStore((state) => state.setTelemetry)
  const finishRun = useGameStore((state) => state.finishRun)
  const status = useGameStore((state) => state.status)
  const virtualControls = useGameStore((state) => state.controls)
  const resetSignal = useGameStore((state) => state.timeLeft === RUN_SECONDS && state.distance === 0 && state.status !== 'lost' && state.status !== 'won')

  useEffect(() => {
    if (resetSignal) {
      player.current = freshPlayer()
    }
  }, [resetSignal])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'KeyR') useGameStore.getState().start()
      if (event.code === 'Enter' && useGameStore.getState().status === 'ready') useGameStore.getState().start()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useFrame((state, delta) => {
    const p = player.current
    const rawKeys = getKeys()
    const demoSteer = Math.sin(p.runTime * 0.88)
    const mergedKeys = {
      forward: rawKeys.forward || virtualControls.forward,
      backward: rawKeys.backward || virtualControls.backward,
      left: rawKeys.left || virtualControls.left,
      right: rawKeys.right || virtualControls.right,
      brake: rawKeys.brake || virtualControls.brake,
    }
    const keys = DEMO_MODE
      ? { ...mergedKeys, forward: true, left: demoSteer > 0.78, right: demoSteer < -0.78, brake: false }
      : mergedKeys

    if (status === 'running') {
      p.runTime += delta
      const accel = keys.forward ? 16 : keys.backward ? -10 : 0
      const braking = keys.brake ? 30 : 0
      p.speed += accel * delta
      p.speed -= braking * delta * Math.sign(p.speed || 1)
      p.speed = MathUtils.damp(p.speed, 0, keys.brake ? 1.8 : 0.58, delta)
      p.speed = MathUtils.clamp(p.speed, -7, 28)

      const steer = (keys.left ? 1 : 0) - (keys.right ? 1 : 0)
      p.x += steer * delta * (7.6 + Math.abs(p.speed) * 0.2)
      p.x = MathUtils.clamp(p.x, -ROAD_EDGE_LIMIT, ROAD_EDGE_LIMIT)
      p.z += p.speed * delta
      p.z = Math.max(0, p.z)
      p.timeLeft = Math.max(0, p.timeLeft - delta)
      p.collisionCooldown = Math.max(0, p.collisionCooldown - delta)
      p.shake = Math.max(0, p.shake - delta * 1.6)
      p.routePhase = routePhaseFor(p.z)

      const offLane = Math.abs(p.x) > SHOULDER_STRESS_LIMIT
      let trafficPressure = 0
      let brushedTraffic = false
      for (const item of traffic) {
        const itemX = laneX(item.lane)
        const itemZ = trafficZ(item.z, item.speed, state.clock.elapsedTime)
        const dz = Math.abs(itemZ - p.z)
        const dx = Math.abs(itemX - p.x)
        const isBrush = dz < 3.0 && dx < 1.52

        if (isBrush && p.collisionCooldown <= 0) {
          p.speed *= 0.62
          p.stress += 5
          p.combo = 1
          p.collisions += 1
          p.collisionCooldown = 0.85
          p.shake = 0.24
          p.message = 'Easy. Normal Thonglor traffic, no need to force it.'
          brushedTraffic = true
        } else if (dz < 4.2 && dx < 2.35) {
          trafficPressure += 4 * delta
        } else if (dz < 8.5 && dx < 3.25) {
          trafficPressure += 1.6 * delta
        }

        const nearMissKey = `${item.id}:traffic`
        if (itemZ < p.z - 1 && itemZ > p.z - 5 && dx < 2.8 && !p.nearMisses.has(nearMissKey)) {
          p.nearMisses.add(nearMissKey)
          p.combo = Math.min(4, p.combo + 0.12)
          p.score += Math.round(30 * p.combo)
          p.message = 'Flowed through traffic smoothly.'
        }
      }

      const cafeMilestones = [
        { id: 'garden', z: FINISH_Z * 0.22, label: 'Garden cafe spotted.' },
        { id: 'brunch', z: FINISH_Z * 0.44, label: 'Brunch place looks busy.' },
        { id: 'terrace', z: CAFE_STOP_ZONE, label: 'This scenic cafe has the right vibe.' },
      ]
      for (const cafe of cafeMilestones) {
        if (p.z > cafe.z && !p.cafesSeen.has(cafe.id)) {
          p.cafesSeen.add(cafe.id)
          p.combo = Math.min(4, p.combo + 0.35)
          p.score += 400
          p.message = cafe.label
        }
      }

      p.stuckTime = Math.abs(p.speed) < 0.35 && keys.forward ? p.stuckTime + delta : 0
      const scenicSpeed = p.speed > 6 && p.speed < 27
      const holdingGoodLine = Math.abs(p.x) < LANE_WIDTH * 0.62 && scenicSpeed && !brushedTraffic
      p.cleanStreak = holdingGoodLine ? Math.min(9.9, p.cleanStreak + delta) : Math.max(0, p.cleanStreak - delta * 1.8)
      const cleanRecovery = p.cleanStreak > 1.2 ? 6.8 * delta : 0
      const cafeMoodLift = p.cafesSeen.size * 0.55 * delta
      p.stress += trafficPressure * 0.55 + (offLane ? 4.5 * delta : -5.5 * delta) + (p.stuckTime > 4.5 ? 1.2 * delta : 0) - cleanRecovery - cafeMoodLift
      p.stress = MathUtils.clamp(p.stress, 0, 100)
      p.score += Math.max(0, p.speed) * delta * (0.35 + p.combo * 0.08)
      if (p.cleanStreak > 2.5) p.score += delta * 14 * Math.min(3, p.cleanStreak / 2.5)
      if (offLane) p.message = 'Stay in the lane and enjoy the street.'
      if (p.stuckTime > 4.5) p.message = 'Take it easy. This is a cafe cruise.'
      if (p.cleanStreak > 3.5 && p.runTime % 4 < delta) p.message = 'Smooth Thonglor cruise.'

      const objectives: Objectives = {
        survive: p.z > 80 || p.score > 240,
        dodgeConcrete: p.cafesSeen.size >= 1,
        exitReady: p.cafesSeen.size >= 2,
        reachNursery: p.z >= CAFE_STOP_ZONE,
        grabChild: p.z >= CAFE_STOP_ZONE && p.speed < 8,
        escapeNursery: false,
      }

      let nextStatus: GameStatus = status
      if (p.z >= CAFE_STOP_ZONE && p.speed < 8) {
        setTelemetry({
          stress: p.stress,
          timeLeft: p.timeLeft,
          score: Math.round(p.score + Math.max(0, 100 - p.stress) * 12),
          distance: Math.min(1, p.z / FINISH_Z),
          routePhase: 'Parked at a scenic cafe',
          message: 'Parked gently. Time for good coffee.',
          objectives: {
            survive: true,
            dodgeConcrete: true,
            exitReady: true,
            reachNursery: true,
            grabChild: true,
            escapeNursery: false,
          },
        })
        finishRun()
        return
      }
      if (p.stress >= 100) {
        nextStatus = 'lost'
        p.message = 'Cafe mood ruined. Reset and cruise softer.'
      }

      if (nextStatus !== 'running') {
        const currentBest = Number(window.localStorage.getItem('rama-ii-best-score') ?? 0)
        if (p.score > currentBest) window.localStorage.setItem('rama-ii-best-score', String(Math.round(p.score)))
      }

      setTelemetry({
        timeLeft: p.timeLeft,
        stress: p.stress,
        status: nextStatus,
        speed: Math.max(0, p.speed),
        distance: Math.min(1, p.z / FINISH_Z),
        score: Math.round(p.score),
        combo: p.combo,
        collisions: p.collisions,
        message: p.message,
        routePhase: p.routePhase,
        cleanStreak: p.cleanStreak,
        objectives,
        bestScore: Math.max(Number(window.localStorage.getItem('rama-ii-best-score') ?? 0), Math.round(p.score)),
      })
    }

    if (ev.current) {
      ev.current.position.set(player.current.x, 0.45, player.current.z)
      ev.current.rotation.y = MathUtils.damp(ev.current.rotation.y, (keys.left ? 0.22 : 0) + (keys.right ? -0.22 : 0), 8, delta)
      ev.current.rotation.z = MathUtils.damp(ev.current.rotation.z, (keys.left ? 0.05 : 0) + (keys.right ? -0.05 : 0), 7, delta)
    }

    if (cameraRig.current) {
      const shake = player.current.shake
      const target = new Vector3(player.current.x + Math.sin(state.clock.elapsedTime * 36) * shake * 0.22, 0, player.current.z).add(CAMERA_OFFSET)
      cameraRig.current.position.lerp(target, 1 - Math.exp(-4 * delta))
      cameraRig.current.lookAt(player.current.x, 1.05, player.current.z + 8.2)
    }

    state.scene.fog?.color.set('#b8d8df')
  })

  return (
    <>
      <color attach="background" args={['#9bcbe0']} />
      <fog attach="fog" args={['#b8d8df', 38, 150]} />
      <PerspectiveCamera ref={cameraRig} makeDefault position={[0, 4.25, -8.6]} fov={56} />
      <ambientLight intensity={0.82} />
      <directionalLight position={[-7, 14, -4]} intensity={2.3} color="#fff0c7" castShadow shadow-mapSize={[2048, 2048]} />
      <pointLight position={[0, 4, -6]} intensity={7} color="#ffd89a" distance={24} />
      <Road />
      <SukhumvitRail />
      <City />
      <CafeStorefronts />
      <ThongLorIdentity />
      <StreetGreenery />
      <CafePatios />
      <StreetPedestrians />
      <Traffic />
      <ScenicCafe />
      <CafeCoupleMoment />
      <GlacierBlueEvSuv refObject={ev} />
      <CinematicGrade />
    </>
  )
}

type NurseryPlayer = {
  x: number
  z: number
  vx: number
  vz: number
  stress: number
  timeLeft: number
  score: number
  combo: number
  collisions: number
  hasChild: boolean
  message: string
  hitCooldown: number
  stumble: number
  fallTimer: number
}

type NurseryPropState = {
  id: string
  x: number
  z: number
  vx: number
  vz: number
  rot: number
}

const nurseryPropSeeds: NurseryPropState[] = [
  { id: 'bench-a', x: -4.7, z: -3.4, vx: 0, vz: 0, rot: 0.08 },
  { id: 'bench-b', x: 4.2, z: -1.6, vx: 0, vz: 0, rot: -0.12 },
  { id: 'toy-car', x: -2.5, z: 1.7, vx: 0, vz: 0, rot: 0.4 },
  { id: 'paper-stack', x: 2.2, z: 2.5, vx: 0, vz: 0, rot: -0.3 },
  { id: 'wet-floor', x: 0.3, z: -0.3, vx: 0, vz: 0, rot: 0.2 },
]

function NurseryRushScene() {
  const propStates = useMemo(() => nurseryPropSeeds.map((prop) => ({ ...prop })), [])
  const player = useRef<NurseryPlayer>({
    x: 0,
    z: -5.4,
    vx: 0,
    vz: 0,
    stress: useGameStore.getState().stress,
    timeLeft: useGameStore.getState().timeLeft,
    score: useGameStore.getState().score,
    combo: useGameStore.getState().combo,
    collisions: useGameStore.getState().collisions,
    hasChild: false,
    message: 'Get inside. Grab your child. Reach the car.',
    hitCooldown: 0,
    stumble: 0,
    fallTimer: 0,
  })
  const props = useRef<NurseryPropState[]>(propStates)
  const playerRig = useRef<Group>(null)
  const cameraRig = useRef<ThreePerspectiveCamera>(null)
  const [, getKeys] = useKeyboardControls()
  const controls = useGameStore((state) => state.controls)
  const status = useGameStore((state) => state.status)
  const hasChild = useGameStore((state) => state.hasChild)
  const setTelemetry = useGameStore((state) => state.setTelemetry)
  const finishRun = useGameStore((state) => state.finishRun)

  useFrame((state, delta) => {
    const p = player.current
    const rawKeys = getKeys()
    const keys = {
      forward: rawKeys.forward || controls.forward,
      backward: rawKeys.backward || controls.backward,
      left: rawKeys.left || controls.left,
      right: rawKeys.right || controls.right,
      brake: rawKeys.brake || controls.brake,
    }

    if (status === 'running') {
      const ix = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
      const iz = (keys.forward ? 1 : 0) - (keys.backward ? 1 : 0)
      const inputLength = Math.hypot(ix, iz) || 1
      const slip = Math.abs(p.x) < 1.1 && p.z > -0.9 && p.z < 0.7 ? 1.55 : 1
      const stumbleControl = p.fallTimer > 0 ? 0.1 : Math.max(0.45, 1 - p.stumble * 0.45)
      p.vx += (ix / inputLength) * 16 * delta * slip * stumbleControl
      p.vz += (iz / inputLength) * 16 * delta * slip * stumbleControl
      if (keys.brake) {
        p.vx = MathUtils.damp(p.vx, 0, 9, delta)
        p.vz = MathUtils.damp(p.vz, 0, 9, delta)
      }
      p.vx = MathUtils.damp(p.vx, 0, 3.6, delta)
      p.vz = MathUtils.damp(p.vz, 0, 3.6, delta)
      p.x = MathUtils.clamp(p.x + p.vx * delta, -5.8, 5.8)
      p.z = MathUtils.clamp(p.z + p.vz * delta, -6.4, 5.8)
      p.timeLeft = Math.max(0, p.timeLeft - delta)
      p.hitCooldown = Math.max(0, p.hitCooldown - delta)
      p.stumble = Math.max(0, p.stumble - delta * 0.85)
      p.fallTimer = Math.max(0, p.fallTimer - delta)

      const adminX = Math.sin(state.clock.elapsedTime * 0.85) * 3.9
      const adminZ = 1.2 + Math.cos(state.clock.elapsedTime * 0.55) * 1.4
      if (Math.hypot(p.x - adminX, p.z - adminZ) < 1.2 && p.hitCooldown <= 0) {
        p.stress += 14
        p.collisions += 1
        p.combo = 1
        p.vx += Math.sign(p.x - adminX || 1) * 4
        p.vz -= 3
        p.stumble = 1
        p.fallTimer = 0.95
        p.message = 'Admin body-check. Stand up.'
        p.hitCooldown = 0.85
      }

      for (const prop of props.current) {
        const distance = Math.hypot(p.x - prop.x, p.z - prop.z)
        if (distance < 0.95) {
          const nx = (prop.x - p.x) / (distance || 1)
          const nz = (prop.z - p.z) / (distance || 1)
          prop.vx += nx * 5.5
          prop.vz += nz * 5.5
          p.vx -= nx * 1.2
          p.vz -= nz * 1.2
          if (p.hitCooldown <= 0) {
            p.score += 80 * p.combo
            p.combo = Math.min(6, p.combo + 0.18)
            p.stress += 3
            p.collisions += 1
            p.stumble = Math.min(1, p.stumble + 0.38)
            if (prop.id.includes('wet')) p.fallTimer = 0.7
            p.message = prop.id.includes('wet') ? 'Wet floor wipeout.' : 'Nursery chaos bonus.'
            p.hitCooldown = 0.28
          }
        }
        prop.x = MathUtils.clamp(prop.x + prop.vx * delta, -5.7, 5.7)
        prop.z = MathUtils.clamp(prop.z + prop.vz * delta, -5.9, 5.6)
        prop.rot += (prop.vx + prop.vz) * delta * 0.22
        prop.vx = MathUtils.damp(prop.vx, 0, 2.8, delta)
        prop.vz = MathUtils.damp(prop.vz, 0, 2.8, delta)
      }

      if (!p.hasChild && Math.hypot(p.x - 0, p.z - 4.4) < 1.25) {
        p.hasChild = true
        p.combo += 0.75
        p.score += 750
        p.message = 'Child secured. Back to the car.'
      }

      if (p.hasChild && p.z < -5.7) {
        setTelemetry({
          stress: p.stress,
          timeLeft: p.timeLeft,
          score: Math.round(p.score + p.timeLeft * 8),
          combo: p.combo,
          collisions: p.collisions,
          hasChild: true,
          routePhase: 'Child secured',
          message: 'Pickup complete. Late fee avoided.',
          objectives: {
            survive: true,
            dodgeConcrete: true,
            exitReady: true,
            reachNursery: true,
            grabChild: true,
            escapeNursery: true,
          },
        })
        finishRun()
        return
      }

      p.stress += (p.hasChild ? -3.5 : 1.2) * delta
      p.stress = MathUtils.clamp(p.stress, 0, 100)
      p.score += Math.max(0, Math.hypot(p.vx, p.vz)) * delta * 8

      if (p.timeLeft <= 0 || p.stress >= 100) {
        setTelemetry({ status: 'lost', stress: p.stress, timeLeft: p.timeLeft, message: p.stress >= 100 ? 'Nursery meltdown.' : 'Late fee stamp landed.' })
        return
      }

      setTelemetry({
        timeLeft: p.timeLeft,
        stress: p.stress,
        speed: Math.hypot(p.vx, p.vz),
        score: Math.round(p.score),
        combo: p.combo,
        collisions: p.collisions,
        hasChild: p.hasChild,
        routePhase: p.hasChild ? 'Escape with child' : 'Nursery Rush',
        message: p.message,
        objectives: {
          survive: true,
          dodgeConcrete: true,
          exitReady: true,
          reachNursery: true,
          grabChild: p.hasChild,
          escapeNursery: false,
        },
      })
    }

      if (playerRig.current) {
      playerRig.current.position.set(p.x, 0, p.z)
      playerRig.current.rotation.y = MathUtils.damp(playerRig.current.rotation.y, Math.atan2(p.vx, p.vz || 0.001), 8, delta)
      const fallLean = p.fallTimer > 0 ? -1.18 : 0
      playerRig.current.rotation.x = MathUtils.damp(playerRig.current.rotation.x, fallLean, 10, delta)
      playerRig.current.rotation.z =
        Math.sin(state.clock.elapsedTime * 14) * Math.min(0.08, Math.hypot(p.vx, p.vz) * 0.012) + Math.sin(state.clock.elapsedTime * 22) * p.stumble * 0.18
    }
    if (cameraRig.current) {
      cameraRig.current.position.lerp(new Vector3(p.x * 0.18 - 1.45, 3.35, p.z - 6.4), 1 - Math.exp(-5 * delta))
      cameraRig.current.lookAt(p.x + 0.15, 1.12, p.z + 2.6)
    }
  })

  return (
    <>
      <color attach="background" args={['#16191b']} />
      <fog attach="fog" args={['#16191b', 16, 40]} />
      <PerspectiveCamera ref={cameraRig} makeDefault position={[-1.45, 3.35, -8.8]} fov={55} />
      <ambientLight intensity={0.86} />
      <directionalLight position={[3, 9, -4]} intensity={1.4} castShadow shadow-mapSize={[2048, 2048]} />
      <pointLight position={[0, 3.5, -2]} intensity={16} color="#ffe6bb" distance={14} />
      <NurseryRoom propStates={propStates} />
      <NurseryCharacter refObject={playerRig} hasChild={hasChild} />
      <AdminCharacter />
      <ChildMarker picked={hasChild} />
    </>
  )
}

function NurseryRoom({ propStates }: { propStates: NurseryPropState[] }) {
  const wallPanels = useMemo(() => Array.from({ length: 9 }, (_, index) => -5.2 + index * 1.3), [])
  const lockers = useMemo(() => Array.from({ length: 5 }, (_, index) => -5.15 + index * 0.58), [])

  return (
    <group>
      <ContactShadows position={[0, 0.03, 0]} opacity={0.52} blur={2.6} scale={14} far={5} />
      <mesh receiveShadow position={[0, -0.06, 0]}>
        <boxGeometry args={[13.2, 0.1, 14.2]} />
        <meshStandardMaterial color="#9f998d" roughness={0.5} metalness={0.05} />
      </mesh>
      {Array.from({ length: 13 }, (_, x) =>
        Array.from({ length: 14 }, (_, z) => (
          <mesh key={`${x}-${z}`} position={[-6 + x, 0.01, -6.5 + z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.9, 0.9]} />
            <meshStandardMaterial color={(x + z) % 2 ? '#a7a196' : '#c4bfb3'} roughness={0.46} metalness={0.04} />
          </mesh>
        )),
      )}
      {wallPanels.map((x) => (
        <mesh key={x} position={[x, 1.72, 5.93]} receiveShadow>
          <boxGeometry args={[0.08, 2.5, 0.08]} />
          <meshStandardMaterial color="#b7b2aa" roughness={0.64} />
        </mesh>
      ))}
      <mesh position={[0, 1.9, 6.08]} receiveShadow>
        <boxGeometry args={[13, 3.8, 0.26]} />
        <meshStandardMaterial color="#d5d1c8" roughness={0.68} />
      </mesh>
      {[-4.8, 0, 4.8].map((x) => (
        <mesh key={`ceiling-beam-${x}`} position={[x, 3.72, -0.1]} receiveShadow>
          <boxGeometry args={[0.24, 0.22, 13.4]} />
          <meshStandardMaterial color="#444947" roughness={0.78} />
        </mesh>
      ))}
      <mesh position={[-6.35, 1.9, 0]} receiveShadow>
        <boxGeometry args={[0.25, 3.8, 14]} />
        <meshStandardMaterial color="#c7c1b8" roughness={0.72} />
      </mesh>
      <mesh position={[6.35, 1.9, 0]} receiveShadow>
        <boxGeometry args={[0.25, 3.8, 14]} />
        <meshStandardMaterial color="#c7c1b8" roughness={0.72} />
      </mesh>
      <group position={[0, 0, -6.18]}>
        {[-1.55, 1.55].map((x) => (
          <mesh key={`door-post-${x}`} position={[x, 1.48, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.22, 2.95, 0.24]} />
            <meshStandardMaterial color="#263230" roughness={0.5} metalness={0.12} />
          </mesh>
        ))}
        <mesh position={[0, 2.9, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.3, 0.22, 0.24]} />
          <meshStandardMaterial color="#263230" roughness={0.5} metalness={0.12} />
        </mesh>
        <mesh position={[0, 1.58, 0.08]}>
          <boxGeometry args={[0.1, 2.45, 0.08]} />
          <meshStandardMaterial color="#18201f" roughness={0.35} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0.04, -0.08]}>
          <boxGeometry args={[3.4, 0.1, 0.5]} />
          <meshStandardMaterial color="#43a867" emissive="#174e32" emissiveIntensity={0.35} />
        </mesh>
      </group>
      <group position={[-4.15, 0, 5.2]}>
        {lockers.map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh castShadow receiveShadow position={[0, 1.05, 0]}>
              <boxGeometry args={[0.5, 2.1, 0.45]} />
              <meshStandardMaterial color="#29343f" roughness={0.38} metalness={0.28} />
            </mesh>
            <mesh position={[0.16, 1.25, -0.24]}>
              <boxGeometry args={[0.12, 0.04, 0.04]} />
              <meshStandardMaterial color="#e3c16b" roughness={0.25} metalness={0.45} />
            </mesh>
          </group>
        ))}
      </group>
      <group position={[4.8, 0, -3.9]}>
        <mesh castShadow receiveShadow position={[0, 1.35, 0]}>
          <boxGeometry args={[2.35, 1.35, 0.12]} />
          <meshStandardMaterial color="#25545e" roughness={0.48} />
        </mesh>
        {[-0.75, 0, 0.75].map((x) => (
          <mesh key={x} castShadow position={[x, 1.48, -0.08]}>
            <boxGeometry args={[0.42, 0.28, 0.08]} />
            <meshStandardMaterial color={x === 0 ? '#f0c85b' : '#f5f0dc'} roughness={0.52} />
          </mesh>
        ))}
      </group>
      {[-2.8, 2.8].map((x) => (
        <group key={x} position={[x, 3.62, -1.1]}>
          <mesh>
            <boxGeometry args={[2.2, 0.08, 0.42]} />
            <meshStandardMaterial color="#fff1c9" emissive="#ffe1a1" emissiveIntensity={1.2} roughness={0.2} />
          </mesh>
          <pointLight position={[0, -0.2, 0]} intensity={5.8} distance={9} color="#ffe7bd" />
        </group>
      ))}
      <mesh position={[0, 0.025, -0.15]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.22, 48]} />
        <meshStandardMaterial color="#4d6d70" roughness={0.08} metalness={0.3} transparent opacity={0.55} />
      </mesh>
      <LateFeeDesk />
      {propStates.map((prop) => <NurseryProp key={prop.id} prop={prop} />)}
    </group>
  )
}

function LateFeeDesk() {
  const stamp = useRef<Group>(null)
  useFrame((state) => {
    if (!stamp.current) return
    stamp.current.position.y = 1.05 + Math.max(0, Math.sin(state.clock.elapsedTime * 3.8)) * 0.58
    stamp.current.rotation.x = -0.2 + Math.sin(state.clock.elapsedTime * 3.8) * 0.18
  })

  return (
    <group position={[3.7, 0, 4.6]}>
      <RoundedBox castShadow receiveShadow position={[0, 0.72, 0]} args={[2.6, 0.22, 1.12]} radius={0.06} smoothness={4}>
        <meshStandardMaterial color="#704d32" roughness={0.48} />
      </RoundedBox>
      <mesh castShadow position={[0, 0.46, 0.43]}>
        <boxGeometry args={[2.45, 0.52, 0.08]} />
        <meshStandardMaterial color="#5a3a26" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[-0.92, 0.28, -0.32]}>
        <boxGeometry args={[0.16, 0.55, 0.16]} />
        <meshStandardMaterial color="#4f3829" roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0.92, 0.28, -0.32]}>
        <boxGeometry args={[0.16, 0.55, 0.16]} />
        <meshStandardMaterial color="#4f3829" roughness={0.6} />
      </mesh>
      <group ref={stamp} position={[0.35, 1.08, 0.02]}>
        <RoundedBox castShadow args={[0.5, 0.34, 0.5]} radius={0.05} smoothness={3}>
          <meshStandardMaterial color="#191817" roughness={0.42} />
        </RoundedBox>
        <RoundedBox castShadow position={[0, -0.3, 0]} args={[0.78, 0.12, 0.78]} radius={0.04} smoothness={3}>
          <meshStandardMaterial color="#d33d32" emissive="#9d1712" emissiveIntensity={0.35} roughness={0.36} />
        </RoundedBox>
      </group>
      <mesh position={[-0.28, 0.86, 0.04]} rotation={[0, 0.08, -0.02]}>
        <boxGeometry args={[1.2, 0.04, 0.7]} />
        <meshStandardMaterial color="#f8f0d2" roughness={0.4} />
      </mesh>
      <mesh position={[0.68, 0.87, -0.12]} rotation={[0, -0.16, 0.03]}>
        <boxGeometry args={[0.9, 0.035, 0.55]} />
        <meshStandardMaterial color="#f0e2bf" roughness={0.42} />
      </mesh>
    </group>
  )
}

function NurseryProp({ prop }: { prop: NurseryPropState }) {
  const group = useRef<Group>(null)
  useFrame(() => {
    if (!group.current) return
    group.current.position.set(prop.x, 0.25, prop.z)
    group.current.rotation.y = prop.rot
  })

  if (prop.id.includes('bench')) {
    return (
      <group ref={group}>
        <RoundedBox castShadow receiveShadow position={[0, 0.34, 0]} args={[2.35, 0.28, 0.66]} radius={0.08} smoothness={4}>
          <meshStandardMaterial color="#826246" roughness={0.46} />
        </RoundedBox>
        {[-0.85, 0.85].map((x) =>
          [-0.22, 0.22].map((z) => (
            <mesh key={`${x}-${z}`} castShadow position={[x, 0.11, z]}>
              <boxGeometry args={[0.12, 0.32, 0.12]} />
              <meshStandardMaterial color="#3f332a" roughness={0.52} />
            </mesh>
          )),
        )}
      </group>
    )
  }

  if (prop.id.includes('toy')) {
    return (
      <group ref={group}>
        <RoundedBox castShadow position={[0, 0.22, 0]} args={[0.78, 0.32, 0.45]} radius={0.12} smoothness={4}>
          <meshStandardMaterial color="#df463d" roughness={0.4} />
        </RoundedBox>
        <mesh castShadow position={[0.18, 0.42, 0]}>
          <boxGeometry args={[0.34, 0.18, 0.38]} />
          <meshStandardMaterial color="#f6c25a" roughness={0.36} />
        </mesh>
        {[-0.28, 0.28].map((x) =>
          [-0.24, 0.24].map((z) => (
            <mesh key={`${x}-${z}`} castShadow position={[x, 0.1, z]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 0.08, 16]} />
              <meshStandardMaterial color="#151719" roughness={0.3} metalness={0.18} />
            </mesh>
          )),
        )}
      </group>
    )
  }

  if (prop.id.includes('wet')) {
    return (
      <group ref={group}>
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.9, 48]} />
          <meshStandardMaterial color="#78a9b5" roughness={0.06} metalness={0.42} transparent opacity={0.72} />
        </mesh>
        <mesh castShadow position={[0.78, 0.5, 0]} rotation={[0, 0, -0.2]}>
          <coneGeometry args={[0.24, 0.9, 4]} />
          <meshStandardMaterial color="#e1b33e" roughness={0.44} />
        </mesh>
      </group>
    )
  }

  return (
    <group ref={group}>
      {[0, 0.08, 0.16].map((offset) => (
        <mesh key={offset} castShadow position={[offset - 0.06, 0.2 + offset, offset * 0.4]}>
          <boxGeometry args={[0.78, 0.06, 0.58]} />
          <meshStandardMaterial color="#f3f0dc" roughness={0.45} />
        </mesh>
      ))}
    </group>
  )
}

type HumanStyle = {
  jacket: string
  pants: string
  shirt: string
  skin: string
  hair: string
  tie?: string
  badge?: boolean
}

const DAD_STYLE: HumanStyle = {
  jacket: '#17191d',
  pants: '#111316',
  shirt: '#e8e0cf',
  skin: '#b88766',
  hair: '#17120f',
  tie: '#243f91',
}

const ADMIN_STYLE: HumanStyle = {
  jacket: '#8a2430',
  pants: '#252629',
  shirt: '#f3dfc9',
  skin: '#a97e62',
  hair: '#26211f',
  badge: true,
}

function ImportedHumanoid({
  style,
  animation,
  scale = 1.14,
  carryChild = false,
}: {
  style: HumanStyle
  animation?: string
  scale?: number
  carryChild?: boolean
}) {
  const { scene, animations } = useGLTF('/models/CesiumMan.glb')
  const model = useMemo(() => cloneSkeleton(scene) as Group, [scene])
  const { actions } = useAnimations(animations, model)

  useEffect(() => {
    model.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      if (source instanceof MeshStandardMaterial) {
        const material = source.clone()
        material.roughness = Math.min(0.78, material.roughness + 0.12)
        material.metalness = Math.max(0, material.metalness * 0.35)
        material.color.set(style.badge ? '#b44a51' : '#3b3e45')
        mesh.material = material
      }
    })
  }, [model, style.badge])

  useEffect(() => {
    const namedAction = animation ? actions[animation] : undefined
    const action = namedAction ?? Object.values(actions).find(Boolean)
    action?.reset().fadeIn(0.2).play()
    return () => {
      action?.fadeOut(0.2)
    }
  }, [actions, animation])

  return (
    <group scale={scale} rotation={[0, Math.PI, 0]}>
      <primitive object={model} />
      <mesh castShadow position={[0, 1.18, -0.18]}>
        <boxGeometry args={[0.34, 0.54, 0.035]} />
        <meshStandardMaterial color={style.shirt} roughness={0.48} />
      </mesh>
      {style.tie && (
        <mesh castShadow position={[0, 1.12, -0.205]}>
          <boxGeometry args={[0.12, 0.5, 0.04]} />
          <meshStandardMaterial color={style.tie} roughness={0.42} />
        </mesh>
      )}
      {style.badge && (
        <mesh castShadow position={[0.18, 1.26, -0.2]}>
          <boxGeometry args={[0.16, 0.1, 0.04]} />
          <meshStandardMaterial color="#f6d35f" emissive="#a87012" emissiveIntensity={0.25} roughness={0.28} />
        </mesh>
      )}
      {carryChild && (
        <group position={[0.38, 0.88, -0.24]} rotation={[0.6, 0.12, -0.74]}>
          <ChildFigure small carried />
        </group>
      )}
    </group>
  )
}

function ChildFigure({ small = false, carried = false }: { small?: boolean; carried?: boolean }) {
  const s = small ? 0.72 : 1
  return (
    <group scale={s} rotation={carried ? [0, 0, 0] : [0, 0, 0]}>
      <mesh castShadow position={[0, 0.58, 0]}>
        <cylinderGeometry args={[0.17, 0.2, 0.46, 8]} />
        <meshStandardMaterial color="#f2bd4d" roughness={0.45} />
      </mesh>
      <mesh castShadow position={[0, 1.0, 0.02]}>
        <sphereGeometry args={[0.17, 16, 12]} />
        <meshStandardMaterial color="#c88f6c" roughness={0.52} />
      </mesh>
      <mesh castShadow position={[0, 1.13, 0]}>
        <sphereGeometry args={[0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45]} />
        <meshStandardMaterial color="#2f2722" roughness={0.54} />
      </mesh>
      {[-0.13, 0.13].map((x) => (
        <mesh key={`child-leg-${x}`} castShadow position={[x, 0.22, 0]}>
          <capsuleGeometry args={[0.055, 0.28, 5, 8]} />
          <meshStandardMaterial color="#315e9a" roughness={0.5} />
        </mesh>
      ))}
      {[-0.24, 0.24].map((x) => (
        <mesh key={`child-arm-${x}`} castShadow position={[x, 0.62, 0.03]} rotation={[0.18, 0, -0.16 * Math.sign(x)]}>
          <capsuleGeometry args={[0.045, 0.28, 5, 8]} />
          <meshStandardMaterial color="#c88f6c" roughness={0.52} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 0.65, -0.18]}>
        <boxGeometry args={[0.3, 0.4, 0.09]} />
        <meshStandardMaterial color="#2d7fb5" roughness={0.42} />
      </mesh>
    </group>
  )
}

function NurseryCharacter({ refObject, hasChild }: { refObject: RefObject<Group | null>; hasChild: boolean }) {
  return (
    <group ref={refObject}>
      <ImportedHumanoid style={DAD_STYLE} scale={1.17} carryChild={hasChild} />
    </group>
  )
}

function AdminCharacter() {
  const group = useRef<Group>(null)
  useFrame((state) => {
    if (!group.current) return
    group.current.position.set(Math.sin(state.clock.elapsedTime * 0.85) * 3.9, 0, 1.2 + Math.cos(state.clock.elapsedTime * 0.55) * 1.4)
    group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.85) > 0 ? -0.4 : 0.4
  })
  return (
    <group ref={group}>
      <ImportedHumanoid style={ADMIN_STYLE} scale={1.08} />
      <group position={[-0.55, 0.94, 0.22]} rotation={[0.18, -0.12, 0.08]}>
        <mesh castShadow>
          <boxGeometry args={[0.42, 0.56, 0.04]} />
          <meshStandardMaterial color="#d2c4a6" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.22, 0.03]}>
          <boxGeometry args={[0.34, 0.04, 0.03]} />
          <meshStandardMaterial color="#151515" roughness={0.4} />
        </mesh>
      </group>
    </group>
  )
}

function ChildMarker({ picked }: { picked: boolean }) {
  if (picked) return null
  return (
    <group position={[0, 0, 4.4]}>
      <ChildFigure />
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.56, 0.72, 40]} />
        <meshStandardMaterial color="#ffe17a" emissive="#f2bb2d" emissiveIntensity={0.45} transparent opacity={0.78} />
      </mesh>
      <pointLight position={[0, 1.4, 0]} intensity={9} color="#fff2a8" distance={6} />
    </group>
  )
}

useGLTF.preload('/models/CesiumMan.glb')

function Road() {
  const segments = useMemo(() => Array.from({ length: 36 }, (_, index) => index * 28), [])

  return (
    <group>
      <mesh receiveShadow position={[0, -0.05, 420]}>
        <boxGeometry args={[ROAD_WIDTH, 0.12, 940]} />
        <meshStandardMaterial color="#2c3436" roughness={0.42} metalness={0.12} />
      </mesh>
      <mesh receiveShadow position={[0, -0.01, 420]}>
        <boxGeometry args={[ROAD_WIDTH - 0.6, 0.025, 940]} />
        <meshStandardMaterial color="#303a3c" roughness={0.34} metalness={0.18} transparent opacity={0.58} />
      </mesh>
      {[-10.3, 10.3].map((x) => (
        <mesh key={`sidewalk-${x}`} receiveShadow position={[x, 0.03, 420]}>
          <boxGeometry args={[4.2, 0.18, 940]} />
          <meshStandardMaterial color="#b9b3a6" roughness={0.62} />
        </mesh>
      ))}
      {[-8.1, 8.1].map((x) => (
        <mesh key={`curb-${x}`} receiveShadow castShadow position={[x, 0.18, 420]}>
          <boxGeometry args={[0.36, 0.42, 940]} />
          <meshStandardMaterial color="#e4ded2" roughness={0.56} />
        </mesh>
      ))}
      <SunPatches />
      {[-7.8, 7.8].map((x) => (
        <mesh key={x} receiveShadow castShadow position={[x, 0.24, 420]}>
          <boxGeometry args={[0.12, 0.16, 940]} />
          <meshStandardMaterial color="#f1eee1" roughness={0.45} />
        </mesh>
      ))}
      {[-LANE_WIDTH / 2, LANE_WIDTH / 2].map((x) =>
        segments.map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.03, z + 5]}>
            <boxGeometry args={[0.12, 0.035, 7.5]} />
            <meshStandardMaterial color="#d8d9cb" emissive="#5a5a4d" emissiveIntensity={0.12} />
          </mesh>
        )),
      )}
      {segments.map((z, index) => (
        <mesh key={z} position={[index % 2 ? -8.55 : 8.55, 4.8, z + 8]} rotation={[0, 0, index % 2 ? 0.12 : -0.12]}>
          <boxGeometry args={[0.3, 8.8, 0.3]} />
          <meshStandardMaterial color="#2e363b" />
          <pointLight intensity={6} distance={16} color="#ffd97a" position={[0, -3, 0]} />
        </mesh>
      ))}
      <OverheadSigns />
      <RoadTextureDetails />
    </group>
  )
}

function RoadTextureDetails() {
  return (
    <group>
      {Array.from({ length: 58 }, (_, index) => {
        const z = 10 + index * 16
        const x = ((index * 19) % 110) / 10 - 5.5
        return (
          <mesh key={index} position={[x, 0.038, z]} rotation={[-Math.PI / 2, 0, (index % 7) * 0.18]}>
            <planeGeometry args={[0.5 + (index % 5) * 0.18, 0.035]} />
            <meshStandardMaterial color="#6f7775" transparent opacity={0.18} roughness={0.8} />
          </mesh>
        )
      })}
      {Array.from({ length: 24 }, (_, index) => (
        <mesh key={`cross-${index}`} position={[index % 2 ? -5.9 : 5.9, 0.04, 28 + index * 34]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.9, 0.16]} />
          <meshStandardMaterial color="#f7f1dc" transparent opacity={0.22} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

function SunPatches() {
  return (
    <group>
      {Array.from({ length: 38 }, (_, index) => {
        const x = ((index * 17) % 11) - 5.5
        const z = 18 + index * 23
        const width = 1.3 + (index % 4) * 0.55
        return (
          <mesh key={index} position={[x, 0.025, z]} rotation={[-Math.PI / 2, 0, (index % 5) * 0.2]}>
            <planeGeometry args={[width, 6 + (index % 3) * 2]} />
            <meshStandardMaterial color="#f5d99a" transparent opacity={0.16} roughness={0.36} metalness={0.05} />
          </mesh>
        )
      })}
    </group>
  )
}

function OverheadSigns() {
  return (
    <group>
      {[115, 310, 565, 760].map((z, index) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[-5.8, 6.4, 0]}>
            <boxGeometry args={[0.32, 8, 0.32]} />
            <meshStandardMaterial color="#273139" roughness={0.5} metalness={0.25} />
          </mesh>
          <mesh position={[5.8, 6.4, 0]}>
            <boxGeometry args={[0.32, 8, 0.32]} />
            <meshStandardMaterial color="#273139" roughness={0.5} metalness={0.25} />
          </mesh>
          <mesh position={[0, 9.4, 0]}>
            <boxGeometry args={[12, 0.24, 0.24]} />
            <meshStandardMaterial color="#273139" roughness={0.5} metalness={0.25} />
          </mesh>
          <mesh position={[0, 7.9, 0.12]}>
            <boxGeometry args={[5.6, 1.8, 0.16]} />
            <meshStandardMaterial
              color={index % 2 ? '#402b10' : '#124231'}
              emissive={index % 2 ? '#ff9f24' : '#1b7c5a'}
              emissiveIntensity={0.25}
              roughness={0.42}
            />
          </mesh>
          <Text position={[0, 7.92, 0.23]} fontSize={0.36} color={index % 2 ? '#ffbd5d' : '#daf8e8'} anchorX="center" anchorY="middle">
            {index % 2 ? 'SOI 55  COFFEE  IZAKAYA' : 'THONG LO  SUKHUMVIT 55'}
          </Text>
        </group>
      ))}
    </group>
  )
}

function SukhumvitRail() {
  return (
    <group position={[-13.2, 0, 0]}>
      <mesh castShadow receiveShadow position={[0, 6.7, 420]}>
        <boxGeometry args={[2.4, 0.58, 940]} />
        <meshStandardMaterial color="#d5d1c4" roughness={0.5} metalness={0.14} />
      </mesh>
      <mesh castShadow position={[0, 7.12, 420]}>
        <boxGeometry args={[1.72, 0.16, 940]} />
        <meshStandardMaterial color="#3a4347" roughness={0.34} metalness={0.36} />
      </mesh>
      {Array.from({ length: 19 }, (_, index) => (
        <group key={index} position={[0, 3.35, index * 52]}>
          <mesh castShadow position={[0, 1.65, 0]}>
            <boxGeometry args={[1.1, 5.9, 0.72]} />
            <meshStandardMaterial color="#bdb7aa" roughness={0.58} />
          </mesh>
          <mesh castShadow position={[0, 4.3, 0]}>
            <boxGeometry args={[3.0, 0.34, 0.84]} />
            <meshStandardMaterial color="#d8d2c5" roughness={0.5} />
          </mesh>
        </group>
      ))}
      {[210, 575].map((z) => (
        <group key={z} position={[0, 8.2, z]}>
          <RoundedBox castShadow args={[8.8, 1.12, 2.1]} radius={0.12} smoothness={4}>
            <meshStandardMaterial color="#e4e7e4" roughness={0.32} metalness={0.18} />
          </RoundedBox>
          <mesh position={[0, 0.06, 1.08]}>
            <boxGeometry args={[8.1, 0.42, 0.05]} />
            <meshStandardMaterial color="#204f8c" emissive="#113057" emissiveIntensity={0.16} roughness={0.22} />
          </mesh>
          {[-3.2, -1.6, 0, 1.6, 3.2].map((x) => (
            <mesh key={x} position={[x, 0.06, 1.13]}>
              <boxGeometry args={[0.72, 0.34, 0.04]} />
              <meshStandardMaterial color="#18242d" roughness={0.18} metalness={0.36} />
            </mesh>
          ))}
          <Text position={[0, 0.08, 1.18]} fontSize={0.32} color="#eaf6ff" anchorX="center" anchorY="middle">
            BTS THONG LO
          </Text>
        </group>
      ))}
    </group>
  )
}

function ThongLorIdentity() {
  return (
    <group>
      {[92, 262, 432, 642, 812].map((z, index) => {
        const side = index % 2 ? -1 : 1
        return (
          <group key={z} position={[side * 9.15, 0, z]} rotation={[0, side > 0 ? -0.08 : 0.08, 0]}>
            <mesh castShadow position={[0, 1.8, 0]}>
              <boxGeometry args={[0.16, 3.6, 0.16]} />
              <meshStandardMaterial color="#2b3235" roughness={0.38} metalness={0.32} />
            </mesh>
            <RoundedBox castShadow position={[0, 3.28, 0]} args={[2.4, 0.72, 0.12]} radius={0.04} smoothness={3}>
              <meshStandardMaterial color={index % 2 ? '#182528' : '#fff3d2'} emissive={index % 2 ? '#123b36' : '#8d6028'} emissiveIntensity={0.2} roughness={0.32} />
            </RoundedBox>
            <Text position={[0, 3.3, side * -0.08]} rotation={[0, side > 0 ? -0.02 : 0.02, 0]} fontSize={0.26} color={index % 2 ? '#c5ffe5' : '#3b2a18'} anchorX="center" anchorY="middle">
              {index % 2 ? 'JAPANESE DINING' : 'SPECIALTY COFFEE'}
            </Text>
            {index === 2 && (
              <group position={[0, 4.1, 0]}>
                <RoundedBox castShadow args={[2.0, 0.56, 0.12]} radius={0.04} smoothness={3}>
                  <meshStandardMaterial color="#18533f" emissive="#1c674e" emissiveIntensity={0.28} roughness={0.3} />
                </RoundedBox>
                <Text position={[0, 0, side * -0.08]} fontSize={0.24} color="#e2fff0" anchorX="center" anchorY="middle">
                  SOI 55
                </Text>
              </group>
            )}
          </group>
        )
      })}
    </group>
  )
}

function GlacierBlueEvSuv({ refObject }: { refObject: RefObject<Group | null> }) {
  return (
    <group ref={refObject}>
      <RoundedBox castShadow receiveShadow position={[0, 0.52, -0.12]} args={[2.38, 0.56, 4.58]} radius={0.34} smoothness={10}>
        <meshStandardMaterial color="#9ed5ea" roughness={0.16} metalness={0.38} />
      </RoundedBox>
      <RoundedBox castShadow position={[0, 0.72, 1.55]} args={[1.96, 0.34, 1.34]} radius={0.3} smoothness={10}>
        <meshStandardMaterial color="#a7dbef" roughness={0.15} metalness={0.4} />
      </RoundedBox>
      <RoundedBox castShadow position={[0, 0.77, -1.75]} args={[2.16, 0.3, 0.86]} radius={0.26} smoothness={8}>
        <meshStandardMaterial color="#8fcbe3" roughness={0.17} metalness={0.42} />
      </RoundedBox>
      <RoundedBox castShadow position={[0, 1.02, -0.34]} args={[1.72, 0.7, 2.42]} radius={0.38} smoothness={12}>
        <meshStandardMaterial color="#13212a" transparent opacity={0.34} roughness={0.04} metalness={0.62} />
      </RoundedBox>
      <RoundedBox castShadow position={[0, 1.27, -0.42]} args={[1.46, 0.08, 1.62]} radius={0.08} smoothness={4}>
        <meshStandardMaterial color="#051015" transparent opacity={0.82} roughness={0.02} metalness={0.82} />
      </RoundedBox>
      <RoundedBox castShadow position={[0, 0.98, 0.93]} rotation={[-0.18, 0, 0]} args={[1.52, 0.42, 0.1]} radius={0.06} smoothness={3}>
        <meshStandardMaterial color="#dff9ff" transparent opacity={0.32} roughness={0.03} metalness={0.7} />
      </RoundedBox>
      <RoundedBox castShadow position={[0, 1.08, -1.52]} rotation={[0.24, 0, 0]} args={[1.46, 0.46, 0.1]} radius={0.06} smoothness={3}>
        <meshStandardMaterial color="#dff9ff" transparent opacity={0.36} roughness={0.03} metalness={0.7} />
      </RoundedBox>
      {[-1.12, 1.12].map((x) => (
        <group key={`side-detail-${x}`} position={[x, 0, 0]}>
          <RoundedBox castShadow position={[0, 0.73, -0.38]} args={[0.045, 0.44, 1.28]} radius={0.04} smoothness={3}>
            <meshStandardMaterial color="#0b1419" roughness={0.05} metalness={0.66} />
          </RoundedBox>
          <mesh castShadow position={[0, 0.55, 0.38]}>
            <boxGeometry args={[0.035, 0.035, 0.44]} />
            <meshStandardMaterial color="#eafcff" roughness={0.16} metalness={0.42} />
          </mesh>
          <mesh castShadow position={[0, 0.55, -0.95]}>
            <boxGeometry args={[0.035, 0.035, 0.34]} />
            <meshStandardMaterial color="#eafcff" roughness={0.16} metalness={0.42} />
          </mesh>
        </group>
      ))}
      <CabinCouple />
      <mesh position={[0, 0.93, 0.18]} rotation={[-0.06, 0, 0]}>
        <boxGeometry args={[1.9, 0.018, 3.45]} />
        <meshStandardMaterial color="#eaffff" transparent opacity={0.16} roughness={0.08} metalness={0.72} />
      </mesh>
      <RoundedBox castShadow position={[0, 0.34, 2.18]} args={[2.04, 0.18, 0.22]} radius={0.12} smoothness={5}>
        <meshStandardMaterial color="#77bfd9" roughness={0.14} metalness={0.42} />
      </RoundedBox>
      <RoundedBox castShadow position={[0, 0.35, -2.18]} args={[2.02, 0.18, 0.22]} radius={0.12} smoothness={5}>
        <meshStandardMaterial color="#6bb6d2" roughness={0.15} metalness={0.38} />
      </RoundedBox>
      {[-1.22, 1.22].map((x) => (
        <RoundedBox key={`mirror-${x}`} castShadow position={[x, 0.96, 0.48]} args={[0.18, 0.12, 0.36]} radius={0.06} smoothness={4}>
          <meshStandardMaterial color="#0d151a" roughness={0.18} metalness={0.46} />
        </RoundedBox>
      ))}
      {[[-1.08, -1.48], [1.08, -1.48], [-1.08, 1.48], [1.08, 1.48]].map(([x, z]) => (
        <group key={`${x}-${z}`} position={[x, 0.31, z]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.39, 0.39, 0.26, 32]} />
            <meshStandardMaterial color="#050607" roughness={0.45} />
          </mesh>
          <mesh position={[0, 0, 0.15]}>
            <cylinderGeometry args={[0.2, 0.2, 0.04, 24]} />
            <meshStandardMaterial color="#c3ccd0" roughness={0.18} metalness={0.58} />
          </mesh>
        </group>
      ))}
      {[-1.09, 1.09].map((x) =>
        [-1.48, 1.48].map((z) => (
          <mesh key={`arch-${x}-${z}`} castShadow position={[x, 0.34, z]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.48, 0.045, 8, 28, Math.PI]} />
            <meshStandardMaterial color="#7bbbd3" roughness={0.17} metalness={0.36} />
          </mesh>
        )),
      )}
      <mesh position={[0, 0.6, 2.34]}>
        <boxGeometry args={[1.72, 0.045, 0.035]} />
        <meshStandardMaterial color="#d9fbff" emissive="#b7efff" emissiveIntensity={2.1} />
      </mesh>
      {[-0.88, 0.88].map((x) => (
        <mesh key={`headlight-${x}`} position={[x, 0.55, 2.32]}>
          <boxGeometry args={[0.44, 0.08, 0.04]} />
          <meshStandardMaterial color="#eefcff" emissive="#ccf4ff" emissiveIntensity={2.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.54, -2.35]}>
        <boxGeometry args={[1.72, 0.055, 0.035]} />
        <meshStandardMaterial color="#ff2d36" emissive="#ff1f2a" emissiveIntensity={2.2} />
      </mesh>
      <pointLight position={[-0.8, 0.45, 2.42]} intensity={4.8} distance={12} color="#d9fbff" />
      <pointLight position={[0.8, 0.45, 2.42]} intensity={4.8} distance={12} color="#d9fbff" />
      <pointLight position={[-0.78, 0.52, -2.38]} intensity={5} distance={8} color="#ff2222" />
      <pointLight position={[0.78, 0.52, -2.38]} intensity={5} distance={8} color="#ff2222" />
      <ContactShadows position={[0, -0.41, 0]} opacity={0.44} scale={5.2} blur={1.8} far={2.8} />
    </group>
  )
}

function CabinCouple() {
  return (
    <group position={[0, 0, -0.16]}>
      {[-0.46, 0.46].map((x) => (
        <group key={`front-seat-${x}`} position={[x, 0.58, -0.64]}>
          <RoundedBox castShadow args={[0.44, 0.72, 0.34]} radius={0.08} smoothness={5}>
            <meshStandardMaterial color="#12171b" roughness={0.52} metalness={0.12} />
          </RoundedBox>
          <RoundedBox castShadow position={[0, -0.22, 0.28]} args={[0.46, 0.16, 0.64]} radius={0.08} smoothness={5}>
            <meshStandardMaterial color="#171d21" roughness={0.5} metalness={0.12} />
          </RoundedBox>
        </group>
      ))}
      <SeatedPerson
        position={[0.42, 0.93, -0.54]}
        skin="#c28d62"
        shirt="#263338"
        hair="#15120f"
        scale={0.72}
        driver
      />
      <SeatedPerson
        position={[-0.42, 0.91, -0.58]}
        skin="#dfb58e"
        shirt="#f1ead9"
        hair="#050404"
        scale={0.68}
        longHair
      />
      <mesh castShadow position={[0.44, 0.78, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.16, 0.018, 8, 28]} />
        <meshStandardMaterial color="#050607" roughness={0.42} metalness={0.28} />
      </mesh>
      <mesh castShadow position={[0.44, 0.76, -0.02]} rotation={[0.2, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.2, 10]} />
        <meshStandardMaterial color="#0a0d0f" roughness={0.36} metalness={0.4} />
      </mesh>
      <RoundedBox position={[0, 1.18, -1.46]} args={[1.28, 0.48, 0.035]} radius={0.03} smoothness={3}>
        <meshStandardMaterial color="#e8fdff" transparent opacity={0.22} roughness={0.02} metalness={0.76} />
      </RoundedBox>
    </group>
  )
}

function SeatedPerson({
  position,
  skin,
  shirt,
  hair,
  scale = 1,
  longHair = false,
  driver = false,
}: {
  position: [number, number, number]
  skin: string
  shirt: string
  hair: string
  scale?: number
  longHair?: boolean
  driver?: boolean
}) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, -0.2, 0.02]} rotation={[0.04, 0, 0]}>
        <capsuleGeometry args={[0.19, 0.5, 10, 16]} />
        <meshStandardMaterial color={shirt} roughness={0.54} />
      </mesh>
      <mesh castShadow position={[0, 0.2, 0.02]} scale={[0.84, 1.08, 0.78]}>
        <sphereGeometry args={[0.18, 28, 18]} />
        <meshStandardMaterial color={skin} roughness={0.52} />
      </mesh>
      <mesh castShadow position={[0, 0.29, -0.04]} scale={[0.92, 0.7, 0.76]}>
        <sphereGeometry args={[0.2, 28, 14]} />
        <meshStandardMaterial color={hair} roughness={0.76} />
      </mesh>
      {longHair && (
        <mesh castShadow position={[0, 0.05, -0.13]} scale={[0.82, 1, 0.5]}>
          <capsuleGeometry args={[0.17, 0.5, 10, 14]} />
          <meshStandardMaterial color={hair} roughness={0.8} />
        </mesh>
      )}
      {[-0.055, 0.055].map((x) => (
        <mesh key={`eye-${x}`} position={[x, 0.22, 0.155]}>
          <sphereGeometry args={[0.015, 10, 8]} />
          <meshStandardMaterial color="#151515" roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 0.17, 0.17]} scale={[0.7, 1, 0.55]}>
        <sphereGeometry args={[0.018, 10, 8]} />
        <meshStandardMaterial color="#a96f4c" roughness={0.58} />
      </mesh>
      <mesh position={[0, 0.11, 0.17]} scale={[1.6, 0.36, 0.36]}>
        <sphereGeometry args={[0.024, 10, 8]} />
        <meshStandardMaterial color="#7c4036" roughness={0.58} />
      </mesh>
      {[-0.16, 0.16].map((x) => (
        <mesh
          key={x}
          castShadow
          position={[x, -0.11, 0.12]}
          rotation={[driver ? 1.04 : 0.62, 0, x > 0 ? -0.48 : 0.48]}
        >
          <capsuleGeometry args={[0.04, driver ? 0.4 : 0.32, 8, 10]} />
          <meshStandardMaterial color={skin} roughness={0.56} />
        </mesh>
      ))}
      {[-0.09, 0.09].map((x) => (
        <mesh key={`leg-${x}`} castShadow position={[x, -0.52, 0.18]} rotation={[1.08, 0, x * 0.8]}>
          <capsuleGeometry args={[0.05, 0.42, 8, 10]} />
          <meshStandardMaterial color="#1f2529" roughness={0.58} />
        </mesh>
      ))}
    </group>
  )
}

function StandingPerson({
  position,
  skin,
  shirt,
  pants,
  hair,
  scale = 1,
  longHair = false,
  pose = 0,
}: {
  position: [number, number, number]
  skin: string
  shirt: string
  pants: string
  hair: string
  scale?: number
  longHair?: boolean
  pose?: number
}) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 1.22, 0]}>
        <capsuleGeometry args={[0.22, 0.52, 10, 14]} />
        <meshStandardMaterial color={shirt} roughness={0.52} />
      </mesh>
      <mesh castShadow position={[0, 1.68, 0]}>
        <sphereGeometry args={[0.2, 24, 14]} />
        <meshStandardMaterial color={skin} roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 1.8, -0.045]}>
        <sphereGeometry args={[0.21, 24, 12]} />
        <meshStandardMaterial color={hair} roughness={0.76} />
      </mesh>
      {longHair && (
        <mesh castShadow position={[0, 1.48, -0.12]}>
          <capsuleGeometry args={[0.16, 0.58, 8, 12]} />
          <meshStandardMaterial color={hair} roughness={0.8} />
        </mesh>
      )}
      {[-0.11, 0.11].map((x) => (
        <mesh key={`leg-${x}`} castShadow position={[x, 0.58, 0]} rotation={[pose * (x > 0 ? 0.16 : -0.12), 0, 0]}>
          <capsuleGeometry args={[0.07, 0.72, 8, 10]} />
          <meshStandardMaterial color={pants} roughness={0.56} />
        </mesh>
      ))}
      {[-0.28, 0.28].map((x) => (
        <mesh key={`arm-${x}`} castShadow position={[x, 1.18, 0.02]} rotation={[0.25 + pose * 0.2, 0, x > 0 ? -0.42 : 0.42]}>
          <capsuleGeometry args={[0.055, 0.5, 8, 10]} />
          <meshStandardMaterial color={skin} roughness={0.54} />
        </mesh>
      ))}
    </group>
  )
}

function Traffic() {
  return (
    <group>
      {traffic.map((car) => (
        <TrafficVehicle key={car.id} car={car} />
      ))}
    </group>
  )
}

function TrafficVehicle({ car }: { car: (typeof traffic)[number] }) {
  const vehicleRef = useRef<Group>(null)

  useFrame((state) => {
    if (!vehicleRef.current) return
    vehicleRef.current.position.z = trafficZ(car.z, car.speed, state.clock.elapsedTime)
  })

  return (
    <group ref={vehicleRef} position={[laneX(car.lane), 0.5, car.z]}>
      <RoundedBox castShadow receiveShadow args={[2.35, car.length > 5 ? 1.45 : 0.95, car.length]} radius={car.length > 5 ? 0.08 : 0.16} smoothness={4}>
        <meshStandardMaterial color={car.color} roughness={0.38} metalness={0.12} />
      </RoundedBox>
      <RoundedBox position={[0, 0.64, -0.35]} args={[1.65, 0.5, Math.min(2.1, car.length * 0.42)]} radius={0.08} smoothness={3}>
        <meshStandardMaterial color="#18232c" roughness={0.18} metalness={0.24} />
      </RoundedBox>
      {[-1.08, 1.08].map((x) =>
        [-car.length * 0.32, car.length * 0.32].map((z) => (
          <mesh key={`${x}-${z}`} castShadow position={[x, -0.26, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.28, 0.28, 0.18, 18]} />
            <meshStandardMaterial color="#08090a" roughness={0.42} />
          </mesh>
        )),
      )}
      {car.length > 5 && (
        <mesh position={[0, 0.22, car.length / 2 + 0.05]}>
          <boxGeometry args={[2.0, 0.26, 0.08]} />
          <meshStandardMaterial color="#d9b45e" emissive="#a46a18" emissiveIntensity={0.18} roughness={0.35} />
        </mesh>
      )}
      <mesh position={[-0.72, 0.05, -car.length / 2 - 0.04]}>
        <boxGeometry args={[0.42, 0.22, 0.08]} />
        <meshStandardMaterial color="#ff2020" emissive="#ff2020" emissiveIntensity={1.5} />
      </mesh>
      <mesh position={[0.72, 0.05, -car.length / 2 - 0.04]}>
        <boxGeometry args={[0.42, 0.22, 0.08]} />
        <meshStandardMaterial color="#ff2020" emissive="#ff2020" emissiveIntensity={1.5} />
      </mesh>
      <pointLight position={[0, 0.45, -car.length / 2 - 0.3]} intensity={3.2} distance={9} color="#ff2a1f" />
    </group>
  )
}

function City() {
  return (
    <group>
      {Array.from({ length: 42 }, (_, index) => {
        const side = index % 2 ? -1 : 1
        const height = 6 + ((index * 13) % 18)
        return (
          <group key={index} position={[side * (15 + (index % 5) * 3), height / 2 - 0.15, index * 22]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[4 + (index % 3) * 2, height, 6 + (index % 4)]} />
              <meshStandardMaterial color={index % 3 === 0 ? '#d7dbd6' : index % 3 === 1 ? '#9fb0b8' : '#303b40'} roughness={0.52} metalness={0.12} />
            </mesh>
            {Array.from({ length: Math.min(9, Math.floor(height / 1.8)) }, (_, row) => (
              <mesh key={`balcony-${row}`} position={[0, -height / 2 + 1.2 + row * 1.55, side > 0 ? -3.18 : 3.18]}>
                <boxGeometry args={[3.2 + (index % 3), 0.08, 0.28]} />
                <meshStandardMaterial color="#f4f0e6" roughness={0.36} metalness={0.12} />
              </mesh>
            ))}
            {Array.from({ length: Math.min(7, Math.floor(height / 2)) }, (_, row) =>
              [-1.25, 0, 1.25].map((x) => (
                <mesh key={`${row}-${x}`} position={[x, -height / 2 + 1.6 + row * 1.7, side > 0 ? -3.06 : 3.06]}>
                  <boxGeometry args={[0.48, 0.34, 0.04]} />
                  <meshStandardMaterial
                    color={row % 3 === 0 ? '#fff5cd' : '#7997a3'}
                    emissive={row % 3 === 0 ? '#f2b95a' : '#36505a'}
                    emissiveIntensity={row % 3 === 0 ? 0.32 : 0.12}
                    roughness={0.22}
                    metalness={0.22}
                  />
                </mesh>
              )),
            )}
          </group>
        )
      })}
      {Array.from({ length: 12 }, (_, index) => (
        <group key={index} position={[index % 2 ? -11.5 : 11.5, 0, 55 + index * 62]} rotation={[0, index % 2 ? -0.2 : 0.2, 0]}>
          <mesh position={[0, 6, 0]}>
            <boxGeometry args={[0.45, 12, 0.45]} />
            <meshStandardMaterial color="#7b6f62" />
          </mesh>
          <mesh position={[0, 12.2, 0]}>
            <boxGeometry args={[5.8, 0.35, 0.35]} />
            <meshStandardMaterial color="#a38755" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function CafeStorefronts() {
  const shops = useMemo(
    () =>
      Array.from({ length: 20 }, (_, index) => ({
        side: index % 2 ? -1 : 1,
        z: 34 + index * 42,
        facade: ['#f2dfc2', '#d9e5dc', '#ead8dc', '#d8e1ec', '#ece1c9'][index % 5],
        awning: ['#315c4c', '#9a3943', '#be8b39', '#304d68'][index % 4],
        sign: ['#fff3d1', '#f2fbff', '#e8ffd9'][index % 3],
        name: ['ROAST HOUSE', 'SUSHI BAR', 'SLOW COFFEE', 'WINE BISTRO', 'MATCHA LAB'][index % 5],
      })),
    [],
  )

  return (
    <group>
      {shops.map((shop, index) => (
        <group key={index} position={[shop.side * 10.4, 0, shop.z]} rotation={[0, shop.side > 0 ? -0.08 : 0.08, 0]}>
          <mesh castShadow receiveShadow position={[0, 1.52, 0]}>
            <boxGeometry args={[5.9, 3.04, 4.1]} />
            <meshStandardMaterial color={shop.facade} roughness={0.56} />
          </mesh>
          <mesh position={[0, 1.58, -shop.side * 2.08]}>
            <boxGeometry args={[4.55, 1.36, 0.12]} />
            <meshStandardMaterial color="#526f72" roughness={0.18} metalness={0.24} />
          </mesh>
          <mesh castShadow position={[0, 2.82, -shop.side * 2.24]} rotation={[0.16 * shop.side, 0, 0]}>
            <boxGeometry args={[5.4, 0.2, 1.15]} />
            <meshStandardMaterial color={shop.awning} roughness={0.5} />
          </mesh>
          <mesh position={[0, 3.28, -shop.side * 2.16]}>
            <boxGeometry args={[3.4, 0.42, 0.12]} />
            <meshStandardMaterial color={shop.sign} emissive="#d7a850" emissiveIntensity={0.26} roughness={0.34} />
          </mesh>
          <Text position={[0, 3.3, -shop.side * 2.24]} rotation={[0, shop.side > 0 ? -0.02 : 0.02, 0]} fontSize={0.22} color="#2d271d" anchorX="center" anchorY="middle">
            {shop.name}
          </Text>
          {index % 4 === 1 && (
            <group position={[shop.side * -2.55, 1.6, -shop.side * 2.28]}>
              {[0, 1, 2].map((lamp) => (
                <mesh key={lamp} castShadow position={[0, 0.62 - lamp * 0.58, 0]}>
                  <sphereGeometry args={[0.18, 16, 10]} />
                  <meshStandardMaterial color="#d84534" emissive="#a81f18" emissiveIntensity={0.24} roughness={0.44} />
                </mesh>
              ))}
            </group>
          )}
          {[-2.15, 2.15].map((x) => (
            <group key={x} position={[x, 0, -shop.side * 2.75]}>
              <mesh castShadow position={[0, 0.26, 0]}>
                <cylinderGeometry args={[0.24, 0.2, 0.52, 16]} />
                <meshStandardMaterial color="#86643c" roughness={0.6} />
              </mesh>
              <mesh castShadow position={[0, 0.82, 0]}>
                <sphereGeometry args={[0.43, 16, 10]} />
                <meshStandardMaterial color={index % 3 === 0 ? '#5d8b55' : '#3f7c62'} roughness={0.64} />
              </mesh>
            </group>
          ))}
          {index % 3 === 0 && (
            <group position={[shop.side * -1.45, 0, -shop.side * 2.9]}>
              <mesh castShadow position={[0, 0.5, 0]}>
                <cylinderGeometry args={[0.38, 0.38, 0.08, 24]} />
                <meshStandardMaterial color="#463728" roughness={0.5} />
              </mesh>
              <mesh castShadow position={[0, 0.26, 0]}>
                <cylinderGeometry args={[0.06, 0.06, 0.52, 12]} />
                <meshStandardMaterial color="#2f2f2d" roughness={0.42} metalness={0.2} />
              </mesh>
            </group>
          )}
        </group>
      ))}
    </group>
  )
}

function StreetGreenery() {
  const trees = useMemo(
    () =>
      Array.from({ length: 34 }, (_, index) => ({
        side: index % 2 ? -1 : 1,
        z: 18 + index * 27,
        lean: ((index % 5) - 2) * 0.035,
        scale: 0.82 + (index % 4) * 0.08,
      })),
    [],
  )

  return (
    <group>
      {trees.map((tree, index) => (
        <group key={index} position={[tree.side * (9.05 + (index % 3) * 0.72), 0, tree.z]} rotation={[0, tree.lean * 6, tree.lean]}>
          <mesh castShadow position={[0, 1.3 * tree.scale, 0]}>
            <cylinderGeometry args={[0.13, 0.22, 2.6 * tree.scale, 10]} />
            <meshStandardMaterial color="#6e5237" roughness={0.72} />
          </mesh>
          {[0, 1, 2].map((layer) => (
            <mesh key={layer} castShadow position={[tree.side * 0.16 * layer, 2.6 * tree.scale + layer * 0.36, 0]} rotation={[0, layer * 0.7, 0]}>
              <sphereGeometry args={[0.82 - layer * 0.12, 18, 12]} />
              <meshStandardMaterial color={layer % 2 ? '#4f8b59' : '#5f9b66'} roughness={0.68} />
            </mesh>
          ))}
          <mesh receiveShadow position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.72, 0.84, 0.16, 22]} />
            <meshStandardMaterial color="#a8845d" roughness={0.64} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: 26 }, (_, index) => {
        const side = index % 2 ? -1 : 1
        return (
          <group key={`planter-${index}`} position={[side * 8.78, 0, 34 + index * 31]}>
            <mesh castShadow receiveShadow position={[0, 0.22, 0]}>
              <boxGeometry args={[1.25, 0.44, 0.72]} />
              <meshStandardMaterial color="#b58c63" roughness={0.66} />
            </mesh>
            {[-0.32, 0, 0.32].map((x) => (
              <mesh key={x} castShadow position={[x, 0.62, 0]}>
                <sphereGeometry args={[0.28, 14, 10]} />
                <meshStandardMaterial color={index % 3 ? '#41784a' : '#7a9b58'} roughness={0.7} />
              </mesh>
            ))}
          </group>
        )
      })}
    </group>
  )
}

function CafePatios() {
  const patios = useMemo(
    () =>
      Array.from({ length: 10 }, (_, index) => ({
        side: index % 2 ? -1 : 1,
        z: 68 + index * 74,
      })),
    [],
  )

  return (
    <group>
      {patios.map((patio, index) => (
        <group key={index} position={[patio.side * 10.05, 0, patio.z]} rotation={[0, patio.side > 0 ? -0.1 : 0.1, 0]}>
          <mesh receiveShadow position={[0, 0.08, 0]}>
            <boxGeometry args={[4.7, 0.12, 3.1]} />
            <meshStandardMaterial color={index % 2 ? '#d2c1aa' : '#c8d3bf'} roughness={0.58} />
          </mesh>
          {[-1.25, 1.25].map((x) => (
            <group key={x} position={[x, 0, -patio.side * 0.2]}>
              <mesh castShadow position={[0, 0.52, 0]}>
                <cylinderGeometry args={[0.34, 0.34, 0.08, 24]} />
                <meshStandardMaterial color="#4c3c2e" roughness={0.5} />
              </mesh>
              <mesh castShadow position={[0, 0.28, 0]}>
                <cylinderGeometry args={[0.045, 0.045, 0.52, 10]} />
                <meshStandardMaterial color="#262423" metalness={0.25} roughness={0.36} />
              </mesh>
              {[-0.52, 0.52].map((chairX) => (
                <RoundedBox key={chairX} castShadow position={[chairX, 0.34, 0.28]} args={[0.34, 0.36, 0.34]} radius={0.04} smoothness={2}>
                  <meshStandardMaterial color={index % 2 ? '#315c4c' : '#9a3943'} roughness={0.48} />
                </RoundedBox>
              ))}
            </group>
          ))}
          <mesh castShadow position={[0, 1.48, 0]} rotation={[0, 0, Math.PI / 4]}>
            <coneGeometry args={[1.5, 0.48, 4]} />
            <meshStandardMaterial color={index % 2 ? '#f4d49b' : '#e9ebdd'} roughness={0.46} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function StreetPedestrians() {
  const people = useMemo(
    () =>
      Array.from({ length: 18 }, (_, index) => ({
        side: index % 2 ? -1 : 1,
        z: 46 + index * 43,
        skin: index % 4 === 0 ? '#c28d62' : index % 4 === 1 ? '#dfb58e' : index % 4 === 2 ? '#b98258' : '#e2bf9c',
        shirt: ['#f4eadc', '#23323a', '#315c4c', '#9a3943', '#d8e1ec'][index % 5],
        pants: ['#15191c', '#2e3438', '#4a463f'][index % 3],
        hair: index % 3 === 0 ? '#050404' : '#15120f',
        longHair: index % 4 === 1,
      })),
    [],
  )

  return (
    <group>
      {people.map((person, index) => (
        <group key={index} position={[person.side * (9.35 + (index % 2) * 0.85), 0, person.z]} rotation={[0, person.side > 0 ? -0.18 : 0.18, 0]}>
          <StandingPerson
            position={[0, 0, 0]}
            skin={person.skin}
            shirt={person.shirt}
            pants={person.pants}
            hair={person.hair}
            scale={0.84 + (index % 3) * 0.05}
            longHair={person.longHair}
            pose={0.25 + (index % 3) * 0.1}
          />
          {index % 3 === 0 && (
            <mesh castShadow position={[0.28 * person.side, 1.05, 0.08]}>
              <boxGeometry args={[0.16, 0.24, 0.05]} />
              <meshStandardMaterial color="#111827" roughness={0.4} metalness={0.18} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}

function CafeCoupleMoment() {
  return (
    <group position={[3.85, 0, CAFE_STOP_ZONE + 18]} rotation={[0, -0.18, 0]}>
      <StandingPerson position={[-0.58, 0, 0.1]} skin="#c28d62" shirt="#23323a" pants="#15191c" hair="#15120f" scale={1.02} pose={0.4} />
      <StandingPerson position={[0.56, 0, -0.08]} skin="#dfb58e" shirt="#f4eadc" pants="#2e3438" hair="#050404" scale={0.96} longHair pose={0.2} />
      <mesh castShadow position={[0, 0.76, 0.5]}>
        <cylinderGeometry args={[0.34, 0.34, 0.08, 28]} />
        <meshStandardMaterial color="#3f3126" roughness={0.48} />
      </mesh>
      <mesh castShadow position={[0, 0.38, 0.5]}>
        <cylinderGeometry args={[0.055, 0.055, 0.72, 12]} />
        <meshStandardMaterial color="#242323" metalness={0.2} roughness={0.38} />
      </mesh>
      {[-0.12, 0.12].map((x) => (
        <group key={x} position={[x, 0.87, 0.48]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.045, 0.035, 0.12, 14]} />
            <meshStandardMaterial color="#f4f0e2" roughness={0.38} />
          </mesh>
          <mesh position={[0, 0.075, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.018, 14]} />
            <meshStandardMaterial color="#b5834c" roughness={0.42} />
          </mesh>
        </group>
      ))}
      <Text position={[0, 2.28, -0.12]} fontSize={0.22} color="#fff7db" anchorX="center" anchorY="middle">
        date coffee stop
      </Text>
      <pointLight position={[0, 2.1, 0.1]} intensity={3.2} distance={6} color="#ffdca0" />
    </group>
  )
}

function ScenicCafe() {
  return (
    <group position={[0, 0, CAFE_STOP_ZONE + 24]}>
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[12, 0.08, 4]} />
        <meshStandardMaterial color="#8bbf75" emissive="#355f2b" emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[0, 2.2, 2.45]} castShadow>
        <boxGeometry args={[7.8, 3.2, 0.45]} />
        <meshStandardMaterial color="#f6ead4" emissive="#b4783d" emissiveIntensity={0.08} roughness={0.52} />
      </mesh>
      <mesh position={[0, 2.15, 2.16]}>
        <boxGeometry args={[6.1, 1.5, 0.12]} />
        <meshStandardMaterial color="#4e6f73" roughness={0.18} metalness={0.22} />
      </mesh>
      <mesh position={[0, 4.05, 2.05]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[5.4, 5.4, 0.28]} />
        <meshStandardMaterial color="#a05b36" roughness={0.55} />
      </mesh>
      <mesh position={[0, 4.08, 1.82]}>
        <boxGeometry args={[4.2, 0.56, 0.12]} />
        <meshStandardMaterial color="#fff4d7" emissive="#d19a45" emissiveIntensity={0.4} roughness={0.32} />
      </mesh>
      {[-3.6, -2.4, 2.4, 3.6].map((x) => (
        <group key={x} position={[x, 0, -0.6]}>
          <mesh castShadow position={[0, 0.36, 0]}>
            <cylinderGeometry args={[0.34, 0.34, 0.72, 20]} />
            <meshStandardMaterial color="#4e7d4b" roughness={0.55} />
          </mesh>
          <mesh castShadow position={[0, 1.05, 0]}>
            <sphereGeometry args={[0.58, 18, 12]} />
            <meshStandardMaterial color="#3e8b4f" roughness={0.62} />
          </mesh>
        </group>
      ))}
      <pointLight position={[0, 3.6, -2]} intensity={8} distance={18} color="#ffe0a6" />
    </group>
  )
}

function CinematicGrade() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <SMAA />
      <Bloom intensity={0.38} luminanceThreshold={0.42} luminanceSmoothing={0.28} mipmapBlur />
      <Vignette offset={0.18} darkness={0.42} />
    </EffectComposer>
  )
}
