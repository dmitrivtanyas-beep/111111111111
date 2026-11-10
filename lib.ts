import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key && !url.includes('YOUR_PROJECT'))
export const supabase = isConfigured ? createClient(url!, key!) : null

export type Word = {
  id: string
  workspace_id: string
  english: string
  ukrainian: string
  example: string | null
  pronunciation: string | null
  part_of_speech: string | null
  tags: string[]
  created_by: string
  created_at: string
  due_at: string
  interval_days: number
  ease: number
  repetitions: number
  last_rating: string | null
  profiles?: { display_name: string | null } | null
}

export type Note = {
  id: string
  workspace_id: string
  owner_id: string
  title: string
  content: string
  visibility: 'private' | 'shared'
  folder: string | null
  updated_at: string
}
