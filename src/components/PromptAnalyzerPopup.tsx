import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PromptAnalyzerPopupProps {
  isOpen: boolean
  onClose: () => void
  prompt: string
  score: number
  improvedScore?: number
  feedback?: string
  improvedPrompt?: string
}

export function PromptAnalyzerPopup({ isOpen, onClose, prompt, score, improvedScore, feedback, improvedPrompt: _improvedPrompt }: PromptAnalyzerPopupProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [shouldRender, setShouldRender] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true)
        })
      })
    } else {
      setIsVisible(false)
      const timer = setTimeout(() => {
        setShouldRender(false)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  const handleClose = () => {
    if (window.electronAPI && improvedScore !== undefined) {
      window.electronAPI.saveScore(score, improvedScore)
    }
    onClose()
  }

  if (!shouldRender) return null

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400'
    if (score >= 60) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent'
    if (score >= 60) return 'Good'
    if (score >= 40) return 'Needs Improvement'
    return 'Poor'
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-200",
        isVisible ? "bg-black/60 backdrop-blur-sm" : "bg-black/0"
      )}
      onClick={handleClose}
    >
      <Card
        className={cn(
          "w-full max-w-lg border-border shadow-2xl transition-all duration-200 cursor-default",
          isVisible
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 translate-y-4"
        )}
        style={{ backgroundColor: 'hsl(var(--background))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader 
          className="flex flex-row items-center justify-between pb-2 cursor-move"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <CardTitle className="text-lg font-medium">Prompt Analysis</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Score Display */}
          <div className="flex items-center justify-center py-4">
            <div className="text-center">
              <div className={cn("text-6xl font-bold tabular-nums", getScoreColor(score))}>
                {score}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {getScoreLabel(score)}
              </div>
            </div>
          </div>

          {/* Score Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Quality Score</span>
              <span>{score}/100</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-500 rounded-full",
                  score >= 80 ? "bg-green-400" : score >= 60 ? "bg-yellow-400" : "bg-red-400"
                )}
                style={{ width: `${score}%` }}
              />
            </div>
          </div>

          {/* Improved Score (if available) */}
          {improvedScore !== undefined && improvedScore > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Refined Score</span>
                <span>{improvedScore}/100</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500 rounded-full bg-blue-300"
                  style={{ width: `${improvedScore}%` }}
                />
              </div>
            </div>
          )}

          {/* Prompt Preview */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Analyzed Prompt</div>
            <div className="p-3 bg-secondary/50 rounded-lg">
              <p className="text-sm font-mono text-foreground whitespace-pre-wrap break-all line-clamp-6">
                {prompt || 'No prompt detected'}
              </p>
            </div>
          </div>

          {/* Feedback */}
          {feedback && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Feedback</div>
              <div className="p-3 bg-secondary/50 rounded-lg">
                <p className="text-sm text-foreground">
                  {feedback}
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleClose}>
              Close
            </Button>
            <Button className="flex-1">
              Improve Prompt
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
