'use client'

import { useRouter } from 'next/navigation'

import type { Project } from '@/lib/supabase/types'

export function ProjectSwitcher({
  current,
  projects,
}: {
  current: { id: string; expert_name: string }
  projects: Pick<Project, 'id' | 'expert_name' | 'status'>[]
}) {
  const router = useRouter()
  return (
    <select
      defaultValue={current.id}
      onChange={(e) => {
        const id = e.target.value
        if (id && id !== current.id) router.push(`/projects/${id}`)
      }}
      className="h-8 max-w-[260px] truncate rounded-md border border-input bg-background px-2 text-sm"
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.expert_name}
          {p.status !== 'active' ? ` (${p.status})` : ''}
        </option>
      ))}
    </select>
  )
}
