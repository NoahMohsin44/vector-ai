import { useEffect, useRef } from 'react'

interface GrainGlowBackgroundProps {
  className?: string
}

export function GrainGlowBackground({ className = '' }: GrainGlowBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number

    class GrainParticle {
      x: number
      y: number
      size: number
      opacity: number
      speedX: number
      speedY: number
      life: number
      maxLife: number

      constructor(centerX: number, centerY: number) {
        const angle = Math.random() * Math.PI * 2
        const distance = Math.random() * 80 + 10
        this.x = centerX + Math.cos(angle) * distance
        this.y = centerY + Math.sin(angle) * distance
        this.size = Math.random() * 0.5 + 0.15
        this.opacity = Math.random() * 0.15 + 0.1
        this.speedX = Math.cos(angle) * (Math.random() * 0.08 + 0.02)
        this.speedY = Math.sin(angle) * (Math.random() * 0.08 + 0.02)
        this.maxLife = Math.random() * 300 + 200
        this.life = this.maxLife
      }

      update() {
        this.x += this.speedX
        this.y += this.speedY
        this.life--
        this.opacity = (this.life / this.maxLife) * 0.2
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`
        ctx.fillRect(this.x, this.y, this.size, this.size)
      }

      isDead() {
        return this.life <= 0
      }
    }

    let particles: GrainParticle[] = []

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.scale(dpr, dpr)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }

    const drawGrainLayer = () => {
      const rect = canvas.getBoundingClientRect()
      const width = rect.width
      const height = rect.height

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const grainIntensity = 5

      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * grainIntensity
        data[i] = Math.max(0, Math.min(255, data[i] + noise))
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise))
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise))
      }

      ctx.putImageData(imageData, 0, 0)

      const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.6)
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
      gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.15)')
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)
    }

    const animate = () => {
      const rect = canvas.getBoundingClientRect()
      const centerX = rect.width / 2
      const centerY = rect.height / 2

      drawGrainLayer()

      const spawnCount = 6
      for (let i = 0; i < spawnCount; i++) {
        particles.push(new GrainParticle(centerX, centerY))
      }

      particles = particles.filter(p => !p.isDead())

      particles.forEach(p => {
        p.update()
        p.draw(ctx)
      })

      animationId = requestAnimationFrame(animate)
    }

    resize()
    animate()
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${className}`}
      style={{ background: '#0a0a0a' }}
    />
  )
}
