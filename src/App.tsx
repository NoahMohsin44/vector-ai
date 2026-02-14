import { useEffect, useState } from 'react'
import { Landing } from '@/pages/Landing'
import { Dashboard } from '@/pages/Dashboard'
import { Popup } from '@/pages/Popup'
import { ImagePopup } from '@/pages/ImagePopup'
import { SelectionOverlay } from '@/pages/SelectionOverlay'
import { TextGrabPopup } from '@/pages/TextGrabPopup'
import { SpeechPopup } from '@/pages/SpeechPopup'
import { AnalyzerPickerPopup } from '@/pages/AnalyzerPickerPopup'
import { supabase, getCurrentUser } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Check if this is the popup window or selection overlay
  const isPopup = window.location.hash.startsWith('#/popup')
  const isImagePopup = window.location.hash.startsWith('#/image-popup')
  const isTextGrabPopup = window.location.hash.startsWith('#/textgrab-popup')
  const isSpeechPopup = window.location.hash.startsWith('#/speech-popup')
  const isAnalyzerPicker = window.location.hash.startsWith('#/analyzer-picker')
  const isSelectionOverlay = window.location.hash.startsWith('#/selection')

  useEffect(() => {
    if (isPopup || isImagePopup || isTextGrabPopup || isSpeechPopup || isAnalyzerPicker || isSelectionOverlay) {
      setLoading(false)
      return
    }

    // Check initial auth state
    getCurrentUser().then((user) => {
      setUser(user)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [isPopup, isImagePopup, isTextGrabPopup, isSpeechPopup, isAnalyzerPicker, isSelectionOverlay])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="titlebar h-10 shrink-0" />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  // Render selection overlay for snipping tool mode
  if (isSelectionOverlay) {
    return <SelectionOverlay />
  }

  // Render popup if this is the popup window
  if (isPopup) {
    return <Popup />
  }

  // Render image popup if this is the image popup window
  if (isImagePopup) {
    return <ImagePopup />
  }

  // Render text grab popup if this is the text grab popup window
  if (isTextGrabPopup) {
    return <TextGrabPopup />
  }

  // Render speech-to-text popup if this is the speech popup window
  if (isSpeechPopup) {
    return <SpeechPopup />
  }

  // Render analyzer picker if this is the picker window
  if (isAnalyzerPicker) {
    return <AnalyzerPickerPopup />
  }

  if (!user) {
    return <Landing onAuthSuccess={() => getCurrentUser().then(setUser)} />
  }

  const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'

  return (
    <Dashboard
      userEmail={user.email || ''}
      fullName={fullName}
      onSignOut={() => setUser(null)}
    />
  )
}

export default App
