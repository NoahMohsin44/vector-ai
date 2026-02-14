import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { signIn, signUp } from '@/lib/supabase'
import { ArrowRight, Loader2 } from 'lucide-react'
import { SineWaveParticles } from '@/components/SineWaveParticles'

interface LandingProps {
  onAuthSuccess: () => void
}

export function Landing({ onAuthSuccess }: LandingProps) {
  const [isSignUp, setIsSignUp] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: authError } = isSignUp
      ? await signUp(email, password, fullName)
      : await signIn(email, password)

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (isSignUp) {
      setError('Check your email to confirm your account')
      setLoading(false)
      return
    }

    onAuthSuccess()
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center overflow-hidden relative">
      {/* Background Animation */}
      <div className="absolute inset-0 z-0">
        <SineWaveParticles className="opacity-50" particleCount={8000} waveCount={3} />
      </div>

      {/* Draggable titlebar */}
      <div className="titlebar h-10 shrink-0 absolute top-0 left-0 right-0 z-50" />

      <div className="w-full max-w-md px-4 animate-in fade-in slide-in-from-bottom-4 duration-500 z-10">
        {/* Logo */}
        <div className="text-center mb-8 -mt-16 relative z-20">
          <h1 className="text-5xl font-bold tracking-tight text-foreground mb-3 animate-in zoom-in-95 duration-500">
            Vector
          </h1>
          <p className="text-muted-foreground text-sm">
            Vibe Code with Speed and Direction
          </p>
        </div>

        {/* Auth Card */}
        <Card className="border-border bg-card/80 backdrop-blur-sm">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-3">
                {isSignUp && (
                  <Input
                    type="text"
                    placeholder="Full Name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    autoComplete="name"
                    className="bg-background/50"
                  />
                )}
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="bg-background/50"
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  className="bg-background/50"
                />
              </div>

              {error && (
                <p className={`text-sm ${error.includes('Check your email') ? 'text-green-400' : 'text-red-400'}`}>
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="w-full h-11 rounded-lg"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    {isSignUp ? 'Create Account' : 'Sign In'}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-center text-sm text-muted-foreground">
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp)
                    setError('')
                    setFullName('')
                  }}
                  className="text-foreground hover:underline"
                >
                  {isSignUp ? 'Sign In' : 'Sign Up'}
                </button>
              </p>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
