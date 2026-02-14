import { useEffect, useRef } from 'react'

interface SineWaveParticlesProps {
    className?: string
    particleCount?: number // Kept for API compatibility, but logic changes to grid
    waveCount?: number // Kept for API compatibility
}

export function SineWaveParticles({
    className = '',
}: SineWaveParticlesProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d', { alpha: true })
        if (!ctx) return

        let animationId: number
        let time = 0

        // Configuration for the "Particle Wave" effect matching the reference image
        const config = {
            rows: 25,             // Reduced rows -> Thinner ribbon
            cols: 0,              // Calculated based on width
            spacingX: 10,         // Consistent horizontal spacing
            spacingY: 5,          // Spacing between rows
            amplitude: 40,        // Visible wave height
            frequency: 0.02,      // Wave density
            speed: 0.02,          // Significantly faster
            particleSize: 1.5,
            waveLength: 0.02,     // Slight offset for visual depth
        }

        const resize = () => {
            const parent = canvas.parentElement
            if (!parent) return

            const rect = parent.getBoundingClientRect()
            const dpr = window.devicePixelRatio || 1

            canvas.width = rect.width * dpr
            canvas.height = rect.height * dpr

            ctx.scale(dpr, dpr)
            canvas.style.width = `${rect.width}px`
            canvas.style.height = `${rect.height}px`

            // Recalculate grid columns based on new width
            config.cols = Math.ceil(rect.width / config.spacingX) + 2 // +2 for buffer
        }

        const animate = () => {
            // Clear with only partial transparency for a trail effect, or full clear for crisp
            // The user wants "no lag", so full clear is safer for performance than accumulation
            const width = canvas.width / (window.devicePixelRatio || 1)
            const height = canvas.height / (window.devicePixelRatio || 1)

            ctx.clearRect(0, 0, width, height)

            // Add Glow Effect
            ctx.shadowBlur = 10
            ctx.shadowColor = 'rgba(255, 255, 255, 0.5)'

            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)' // Base color

            // We want the wave to be centered vertically
            const cy = height / 2

            // Draw the grid of particles
            for (let row = 0; row < config.rows; row++) {
                // Calculate a "depth" factor for this row to fade it out slightly or change size?
                // User requested "SAME SIZE", so we keep size constant.
                // We can vary opacity slightly for depth effect.
                const rowProgress = row / config.rows // 0 to 1
                // Center density: rows in middle are brighter? Or back rows dimmer?
                // Let's make back rows (higher index) dimmer?
                // Actually, often these look best if the array is centered around 0.

                // Offset Y for this row (simulating a tilted plane)
                const rowYOffset = (row - config.rows / 2) * config.spacingY

                ctx.fillStyle = `rgba(255, 255, 255, ${1 - rowProgress * 0.7})` // Fade out further rows

                for (let col = 0; col < config.cols; col++) {
                    const x = col * config.spacingX

                    // The Magic Sine Formula
                    // Primary wave + secondary drifting wave for organic "breathing" feel
                    const angle = (col * config.frequency) + time + (row * config.waveLength)
                    const sineHeight = Math.sin(angle) * config.amplitude

                    // Add a second, slower wave component to make the entire structure undulate
                    const secondaryAngle = (col * config.frequency * 0.5) - time * 0.5
                    const secondaryHeight = Math.sin(secondaryAngle) * (config.amplitude * 0.3)

                    const y = cy + rowYOffset + sineHeight + secondaryHeight

                    // Optimization: Use fillRect instead of arc for massive performance boost
                    // For glow effect to work best with small particles, we might need slightly larger rects or just rely on the blur
                    ctx.fillRect(x, y, config.particleSize, config.particleSize)
                }
            }

            // Reset shadow to avoid affecting other draws if any (though clearing rect handles it usually)
            ctx.shadowBlur = 0

            time += config.speed
            animationId = requestAnimationFrame(animate)
        }

        resize()
        window.addEventListener('resize', resize)
        animate()

        return () => {
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(animationId)
        }
    }, [])

    return (
        <canvas
            ref={canvasRef}
            className={`block w-full h-full pointer-events-none ${className}`}
        />
    )
}
