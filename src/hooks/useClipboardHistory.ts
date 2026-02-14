import { useState, useEffect, useCallback } from 'react'

export interface ClipboardItem {
  id: string
  text: string
  timestamp: Date
  preview: string
}

const MAX_HISTORY = 50

export function useClipboardHistory() {
  const [history, setHistory] = useState<ClipboardItem[]>([])

  const addToHistory = useCallback((text: string) => {
    if (!text.trim()) return

    const newItem: ClipboardItem = {
      id: crypto.randomUUID(),
      text,
      timestamp: new Date(),
      preview: text.length > 100 ? text.slice(0, 100) + '...' : text,
    }

    setHistory((prev) => {
      // Don't add duplicates of the most recent item
      if (prev[0]?.text === text) return prev

      const newHistory = [newItem, ...prev.filter((item) => item.text !== text)]
      return newHistory.slice(0, MAX_HISTORY)
    })
  }, [])

  const copyToClipboard = useCallback(async (text: string) => {
    if (window.electronAPI) {
      await window.electronAPI.writeClipboard(text)
    } else {
      await navigator.clipboard.writeText(text)
    }
  }, [])

  const removeFromHistory = useCallback((id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
  }, [])

  useEffect(() => {
    if (!window.electronAPI) return

    // Get initial clipboard content
    window.electronAPI.getClipboard().then((text) => {
      if (text) addToHistory(text)
    })

    // Listen for clipboard changes
    window.electronAPI.onClipboardChange((text) => {
      addToHistory(text)
    })

    return () => {
      window.electronAPI?.removeClipboardListener()
    }
  }, [addToHistory])

  return {
    history,
    copyToClipboard,
    removeFromHistory,
    clearHistory,
  }
}
