'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function createArchive(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim().slice(0, 100)
  if (!name) redirect('/?error=name')

  const supabase = await createClient()
  // Don't ask for the new row back: ownership is added a moment after the
  // archive is created, so the security rules wouldn't let us read it yet.
  const { error } = await supabase.from('spaces').insert({ name })
  if (error) redirect('/?error=create')

  redirect('/')
}
