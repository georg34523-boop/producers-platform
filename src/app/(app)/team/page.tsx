import { redirect } from 'next/navigation'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireProfile } from '@/lib/auth'
import { ROLE_LABEL } from '@/lib/labels'
import { listProfiles } from '@/lib/queries/profiles'

import { InviteForm } from './invite-form'
import { RoleSelect } from './role-select'

export default async function TeamPage() {
  const me = await requireProfile()
  if (me.role !== 'coo' && me.role !== 'ceo') redirect('/')

  const profiles = await listProfiles()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Команда</h1>
        <p className="text-sm text-muted-foreground">
          Управление пользователями и ролями. Заведённый пользователь сразу может логиниться.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Участники ({profiles.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {profiles.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 px-6 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {p.full_name ?? p.email}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{p.email}</div>
                  </div>
                  {p.id === me.id ? (
                    <span className="text-xs text-muted-foreground">
                      {ROLE_LABEL[p.role]} (вы)
                    </span>
                  ) : (
                    <RoleSelect userId={p.id} role={p.role} />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Добавить пользователя</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteForm />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
