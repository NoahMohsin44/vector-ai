import { useEffect, useRef } from 'react'
import { MessageSquare, Image, Type, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

const analyzers = [
  {
    type: 'prompt' as const,
    label: 'Prompt Analyzer',
    description: 'Score and improve your prompts',
    icon: MessageSquare,
  },
  {
    type: 'image' as const,
    label: 'Image Analyzer',
    description: 'Generate AI-friendly image descriptions',
    icon: Image,
  },
  {
    type: 'textgrab' as const,
    label: 'Text Grab',
    description: 'Extract text from screen with OCR',
    icon: Type,
  },
]

export function AnalyzerPickerPopup() {
  const hasCalledRef = useRef(false)

  useEffect(() => {
    if (hasCalledRef.current) return
    hasCalledRef.current = true

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.electronAPI?.closePopup()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handlePick = (type: 'prompt' | 'image' | 'textgrab') => {
    window.electronAPI?.analyzerPicked(type)
  }

  return (
    <div className="h-screen bg-[#0a0a0a] flex flex-col overflow-hidden rounded-lg border border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-medium text-foreground">Choose Analyzer</h2>
        <Button
          variant="outline"
          size="icon"
          onClick={() => window.electronAPI?.closePopup()}
          className="h-8 w-8"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Options */}
      <div className="flex-1 p-3 space-y-2">
        {analyzers.map((analyzer) => (
          <Button
            key={analyzer.type}
            variant="outline"
            onClick={() => handlePick(analyzer.type)}
            className="w-full flex items-center gap-3 px-4 py-3 h-auto justify-start text-left group"
          >
            <div className="w-9 h-9 rounded-md bg-secondary flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
              <analyzer.icon className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{analyzer.label}</p>
              <p className="text-xs text-muted-foreground">{analyzer.description}</p>
            </div>
          </Button>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">
          Press <kbd className="px-1 py-0.5 bg-secondary rounded text-[10px]">ESC</kbd> to dismiss
        </p>
      </div>
    </div>
  )
}
