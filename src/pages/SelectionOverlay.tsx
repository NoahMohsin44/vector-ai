import { useEffect, useState, useRef, useCallback } from 'react'

interface SelectionBounds {
  x: number
  y: number
  width: number
  height: number
}

export function SelectionOverlay() {
  const [isSelecting, setIsSelecting] = useState(false)
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 })
  const [currentPoint, setCurrentPoint] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const getSelectionBounds = useCallback((): SelectionBounds => {
    const x = Math.min(startPoint.x, currentPoint.x)
    const y = Math.min(startPoint.y, currentPoint.y)
    const width = Math.abs(currentPoint.x - startPoint.x)
    const height = Math.abs(currentPoint.y - startPoint.y)
    return { x, y, width, height }
  }, [startPoint, currentPoint])

  useEffect(() => {
    // Make the page background transparent so the real desktop shows through
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsSelecting(true)
    setStartPoint({ x: e.clientX, y: e.clientY })
    setCurrentPoint({ x: e.clientX, y: e.clientY })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isSelecting) {
      setCurrentPoint({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseUp = () => {
    if (isSelecting) {
      setIsSelecting(false)
      const bounds = getSelectionBounds()

      // Require minimum selection size (10x10 pixels)
      if (bounds.width >= 10 && bounds.height >= 10) {
        window.electronAPI?.selectionMade(bounds)
      } else {
        // Selection too small, reset
        setStartPoint({ x: 0, y: 0 })
        setCurrentPoint({ x: 0, y: 0 })
      }
    }
  }

  const handleCancel = () => {
    window.electronAPI?.cancelSelection()
  }

  const bounds = getSelectionBounds()
  const hasSelection = isSelecting && (bounds.width > 0 || bounds.height > 0)

  return (
    <div
      ref={containerRef}
      className="w-screen h-screen cursor-crosshair select-none relative overflow-hidden"
      style={{ background: 'transparent' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Dim overlay — clip-path cuts out the selected area so it stays bright */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          ...(hasSelection ? {
            clipPath: `polygon(
              0% 0%,
              0% 100%,
              ${bounds.x}px 100%,
              ${bounds.x}px ${bounds.y}px,
              ${bounds.x + bounds.width}px ${bounds.y}px,
              ${bounds.x + bounds.width}px ${bounds.y + bounds.height}px,
              ${bounds.x}px ${bounds.y + bounds.height}px,
              ${bounds.x}px 100%,
              100% 100%,
              100% 0%
            )`
          } : {})
        }}
      />

      {/* Instructions */}
      {!hasSelection && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/70 backdrop-blur-sm rounded-lg text-white text-sm pointer-events-none z-10">
          Click and drag to select an area &bull; ESC to cancel
        </div>
      )}

      {/* Selection rectangle border */}
      {hasSelection && (
        <>
          <div
            className="absolute pointer-events-none"
            style={{
              left: bounds.x,
              top: bounds.y,
              width: bounds.width,
              height: bounds.height,
              border: '2px solid rgba(255, 255, 255, 0.9)',
              boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.4)',
            }}
          />

          {/* Dimensions label */}
          <div
            className="absolute px-2 py-0.5 bg-black/70 backdrop-blur-sm text-white text-xs rounded pointer-events-none"
            style={{
              left: bounds.x + bounds.width / 2,
              top: bounds.y + bounds.height + 6,
              transform: 'translateX(-50%)',
            }}
          >
            {Math.round(bounds.width)} &times; {Math.round(bounds.height)}
          </div>
        </>
      )}
    </div>
  )
}
