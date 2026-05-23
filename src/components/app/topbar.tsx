import { signOut } from '@/app/login/actions'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ROLE_LABEL } from '@/lib/labels'
import type { Profile } from '@/lib/supabase/types'

function initials(name: string | null, email: string): string {
  const src = (name ?? email).trim()
  const parts = src.split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || src[0]!.toUpperCase()
}

export function Topbar({ profile }: { profile: Profile }) {
  const display = profile.full_name ?? profile.email
  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-6">
      <div className="text-sm text-muted-foreground">{ROLE_LABEL[profile.role]}</div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback>{initials(profile.full_name, profile.email)}</AvatarFallback>
          </Avatar>
          <div className="hidden flex-col text-right leading-tight sm:flex">
            <span className="text-sm">{display}</span>
            <span className="text-xs text-muted-foreground">{profile.email}</span>
          </div>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            Выйти
          </Button>
        </form>
      </div>
    </header>
  )
}
