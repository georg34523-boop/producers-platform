import { LogOut } from 'lucide-react'

import { signOut } from '@/app/login/actions'
import { ThemeToggle } from '@/components/app/theme-toggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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
    <header className="flex h-12 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80">
      <Badge variant="secondary" className="text-[11px] font-medium">
        {ROLE_LABEL[profile.role]}
      </Badge>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <div className="hidden items-center gap-2 sm:flex">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-[11px]">
              {initials(profile.full_name, profile.email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col text-right leading-tight">
            <span className="text-xs font-medium">{display}</span>
            <span className="text-[10px] text-muted-foreground">{profile.email}</span>
          </div>
        </div>
        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            aria-label="Вийти"
            title="Вийти"
          >
            <LogOut className="h-[1.05rem] w-[1.05rem]" />
          </Button>
        </form>
      </div>
    </header>
  )
}
