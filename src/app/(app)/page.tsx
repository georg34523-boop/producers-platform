import { Card, CardContent } from '@/components/ui/card'
import { requireProfile } from '@/lib/auth'
import { ROLE_LABEL } from '@/lib/labels'

export default async function DashboardPage() {
  const me = await requireProfile()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Привет, {me.full_name ?? me.email}
        </h1>
        <p className="text-sm text-muted-foreground">
          Роль: {ROLE_LABEL[me.role]} ·{' '}
          {new Date().toLocaleDateString('ru-RU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
      </div>
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Этап 1 ТЗ v2 в разработке: дашборд проектов с план/факт по месяцу.
        </CardContent>
      </Card>
    </div>
  )
}
