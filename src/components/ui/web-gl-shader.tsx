"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

export type ShaderColors = {
  red: string
  green: string
  blue: string
}

export type WebGLShaderProps = {
  colors?: ShaderColors
  xScale?: number
  yScale?: number
  distortion?: number
  speed?: number
  className?: string
}

export const DEFAULT_SHADER_CONFIG = {
  colors: {
    red: "#ff244d",
    green: "#69ff80",
    blue: "#547cff",
  },
  xScale: 1.0,
  yScale: 0.5,
  distortion: 0.05,
  speed: 0.01,
} satisfies Required<Omit<WebGLShaderProps, "className">>

type SceneRefs = {
  scene: THREE.Scene | null
  camera: THREE.OrthographicCamera | null
  renderer: THREE.WebGLRenderer | null
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial> | null
  uniforms: Record<string, { value: unknown }> | null
  animationId: number | null
}

const vertexShader = `
  attribute vec3 position;
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`

const fragmentShader = `
  precision highp float;
  uniform vec2 resolution;
  uniform float time;
  uniform float xScale;
  uniform float yScale;
  uniform float distortion;
  uniform vec3 redColor;
  uniform vec3 greenColor;
  uniform vec3 blueColor;

  void main() {
    vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);
    float d = length(p) * distortion;

    float rx = p.x * (1.0 + d);
    float gx = p.x;
    float bx = p.x * (1.0 - d);

    float r = 0.05 / max(abs(p.y + sin((rx + time) * xScale) * yScale), 0.001);
    float g = 0.05 / max(abs(p.y + sin((gx + time) * xScale) * yScale), 0.001);
    float b = 0.05 / max(abs(p.y + sin((bx + time) * xScale) * yScale), 0.001);

    vec3 color = redColor * r + greenColor * g + blueColor * b;
    gl_FragColor = vec4(color, 1.0);
  }
`

function toThreeColor(value: string) {
  return new THREE.Color(value)
}

export function WebGLShader({
  colors = DEFAULT_SHADER_CONFIG.colors,
  xScale = DEFAULT_SHADER_CONFIG.xScale,
  yScale = DEFAULT_SHADER_CONFIG.yScale,
  distortion = DEFAULT_SHADER_CONFIG.distortion,
  speed = DEFAULT_SHADER_CONFIG.speed,
  className = "",
}: WebGLShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<SceneRefs>({
    scene: null,
    camera: null,
    renderer: null,
    mesh: null,
    uniforms: null,
    animationId: null,
  })
  const settingsRef = useRef({ colors, xScale, yScale, distortion, speed })

  useEffect(() => {
    settingsRef.current = { colors, xScale, yScale, distortion, speed }
    const uniforms = sceneRef.current.uniforms
    if (!uniforms) return

    uniforms.xScale.value = xScale
    uniforms.yScale.value = yScale
    uniforms.distortion.value = distortion
    uniforms.redColor.value = toThreeColor(colors.red)
    uniforms.greenColor.value = toThreeColor(colors.green)
    uniforms.blueColor.value = toThreeColor(colors.blue)
  }, [colors, distortion, speed, xScale, yScale])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const refs = sceneRef.current
    const initial = settingsRef.current
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true })
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const uniforms = {
      resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      time: { value: 0.0 },
      xScale: { value: initial.xScale },
      yScale: { value: initial.yScale },
      distortion: { value: initial.distortion },
      redColor: { value: toThreeColor(initial.colors.red) },
      greenColor: { value: toThreeColor(initial.colors.green) },
      blueColor: { value: toThreeColor(initial.colors.blue) },
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([
          -1, -1, 0, 1, -1, 0, -1, 1, 0,
          1, -1, 0, -1, 1, 0, 1, 1, 0,
        ]),
        3,
      ),
    )

    const material = new THREE.RawShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geometry, material)

    scene.add(mesh)
    refs.scene = scene
    refs.camera = camera
    refs.renderer = renderer
    refs.mesh = mesh
    refs.uniforms = uniforms

    const resize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      renderer.setSize(width, height, false)
      ;(uniforms.resolution.value as THREE.Vector2).set(width, height)
    }

    const animate = () => {
      uniforms.time.value = Number(uniforms.time.value) + settingsRef.current.speed
      renderer.render(scene, camera)
      refs.animationId = requestAnimationFrame(animate)
    }

    resize()
    animate()
    window.addEventListener("resize", resize)

    return () => {
      window.removeEventListener("resize", resize)
      if (refs.animationId !== null) cancelAnimationFrame(refs.animationId)
      scene.remove(mesh)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      refs.scene = null
      refs.camera = null
      refs.renderer = null
      refs.mesh = null
      refs.uniforms = null
      refs.animationId = null
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden="true" className={`fixed inset-0 block h-full w-full ${className}`} />
}
