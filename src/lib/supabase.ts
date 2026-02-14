import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'public'
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
})

export type AuthError = {
  message: string
}

export async function signUp(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  })
  return { data, error }
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  return { data, error }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export function onAuthStateChange(callback: (event: string, session: unknown) => void) {
  return supabase.auth.onAuthStateChange(callback)
}

// Prompt Scores Functions
export interface PromptScore {
  id?: string
  user_id: string
  user_score: number
  refined_score: number
  created_at?: string
}

export async function savePromptScore(userScore: number, refinedScore: number): Promise<{ error: Error | null }> {
  const user = await getCurrentUser()
  if (!user) {
    return { error: new Error('User not authenticated') }
  }

  const { error } = await supabase
    .from('prompt_scores')
    .insert({
      user_id: user.id,
      user_score: Math.round(userScore),
      refined_score: Math.round(refinedScore)
    })

  if (error) {
    console.error('Error saving prompt score:', error)
    return { error: new Error(error.message) }
  }

  // Keep only the last 25 scores per user
  const { data: allScores } = await supabase
    .from('prompt_scores')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (allScores && allScores.length > 25) {
    const scoresToDelete = allScores.slice(0, allScores.length - 25)
    const idsToDelete = scoresToDelete.map(s => s.id)

    await supabase
      .from('prompt_scores')
      .delete()
      .in('id', idsToDelete)
  }

  return { error: null }
}

export async function getPromptScores(): Promise<{ data: PromptScore[] | null; error: Error | null }> {
  const user = await getCurrentUser()
  if (!user) {
    return { data: null, error: new Error('User not authenticated') }
  }

  const { data, error } = await supabase
    .from('prompt_scores')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(25)

  if (error) {
    console.error('Error loading prompt scores:', error)
    return { data: null, error: new Error(error.message) }
  }

  return { data, error: null }
}

// Prompt Sessions and History
export interface PromptSession {
  id?: string
  user_id: string
  name: string
  created_at?: string
}

export interface SessionPrompt {
  id?: string
  session_id: string
  original_prompt: string
  improved_prompt: string
  user_score: number
  refined_score: number
  feedback: string
  created_at?: string
}

// Local Storage based session management (bypasses Supabase schema cache issues)
const SESSIONS_KEY = 'vector_prompt_sessions'
const PROMPTS_KEY = 'vector_session_prompts'

function getLocalSessions(): PromptSession[] {
  try {
    const data = localStorage.getItem(SESSIONS_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function saveLocalSessions(sessions: PromptSession[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
}

function getLocalPrompts(): SessionPrompt[] {
  try {
    const data = localStorage.getItem(PROMPTS_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function saveLocalPrompts(prompts: SessionPrompt[]): void {
  localStorage.setItem(PROMPTS_KEY, JSON.stringify(prompts))
}

export async function createSession(name: string): Promise<{ data: PromptSession | null; error: Error | null }> {
  const user = await getCurrentUser()

  const newSession: PromptSession = {
    id: crypto.randomUUID(),
    user_id: user?.id || 'local',
    name,
    created_at: new Date().toISOString()
  }

  const sessions = getLocalSessions()
  sessions.unshift(newSession)
  saveLocalSessions(sessions)

  return { data: newSession, error: null }
}

export async function getSessions(): Promise<{ data: PromptSession[] | null; error: Error | null }> {
  // Return all local sessions (single-user desktop app)
  const sessions = getLocalSessions()
  return { data: sessions, error: null }
}

export async function deleteSession(sessionId: string): Promise<{ error: Error | null }> {
  // Delete prompts for this session
  const prompts = getLocalPrompts().filter(p => p.session_id !== sessionId)
  saveLocalPrompts(prompts)

  // Delete session
  const sessions = getLocalSessions().filter(s => s.id !== sessionId)
  saveLocalSessions(sessions)

  return { error: null }
}

export async function getSessionPrompts(sessionId: string): Promise<{ data: SessionPrompt[] | null; error: Error | null }> {
  const prompts = getLocalPrompts()
    .filter(p => p.session_id === sessionId)
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())

  return { data: prompts, error: null }
}

export async function saveSessionPrompt(
  sessionId: string,
  originalPrompt: string,
  improvedPrompt: string,
  userScore: number,
  refinedScore: number,
  feedback: string
): Promise<{ error: Error | null }> {
  const newPrompt: SessionPrompt = {
    id: crypto.randomUUID(),
    session_id: sessionId,
    original_prompt: originalPrompt,
    improved_prompt: improvedPrompt,
    user_score: Math.round(userScore),
    refined_score: Math.round(refinedScore),
    feedback,
    created_at: new Date().toISOString()
  }

  const prompts = getLocalPrompts()
  prompts.push(newPrompt)
  saveLocalPrompts(prompts)

  return { error: null }
}

export async function getActiveSession(): Promise<{ data: PromptSession | null; error: Error | null }> {
  const sessions = getLocalSessions()

  // Check if there's a stored active session ID
  const storedActiveId = localStorage.getItem('vector_active_session_id')
  if (storedActiveId) {
    const activeSession = sessions.find(s => s.id === storedActiveId)
    if (activeSession) {
      return { data: activeSession, error: null }
    }
  }

  // Fall back to most recent session
  if (sessions.length > 0) {
    return { data: sessions[0], error: null }
  }

  // No session exists, create one
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const { data: newSession, error: createError } = await createSession(`Session - ${today}`)

  // Set it as active
  if (newSession?.id) {
    localStorage.setItem('vector_active_session_id', newSession.id)
  }

  return { data: newSession, error: createError }
}

export async function generateSessionContext(sessionId: string): Promise<{ context: string; error: Error | null }> {
  const { data: prompts, error } = await getSessionPrompts(sessionId)

  if (error || !prompts) {
    return { context: '', error: error || new Error('No prompts found') }
  }

  if (prompts.length === 0) {
    return { context: 'No prompts in this session yet.', error: null }
  }

  const avgUserScore = Math.round(prompts.reduce((sum, p) => sum + p.user_score, 0) / prompts.length)
  const avgRefinedScore = Math.round(prompts.reduce((sum, p) => sum + p.refined_score, 0) / prompts.length)

  let context = `# Session Context Summary\n\n`
  context += `**Total Prompts:** ${prompts.length}\n`
  context += `**Average Original Score:** ${avgUserScore}/100\n`
  context += `**Average Improved Score:** ${avgRefinedScore}/100\n\n`
  context += `---\n\n`
  context += `## Prompts in this session:\n\n`

  prompts.forEach((prompt, index) => {
    context += `### Prompt ${index + 1}\n`
    context += `**Original (Score: ${prompt.user_score}):**\n${prompt.original_prompt}\n\n`
    context += `**Improved (Score: ${prompt.refined_score}):**\n${prompt.improved_prompt}\n\n`
    context += `**Feedback:** ${prompt.feedback}\n\n`
    context += `---\n\n`
  })

  return { context, error: null }
}
