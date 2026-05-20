import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireProfile } from '@/lib/auth'

export default async function DashboardPage() {
  const profile = await requireProfile()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Привет, {profile.full_name ?? profile.email}</h1>
        <p className="text-sm text-muted-foreground">
          Здесь будет общая картина по проектам, цели месяца и сегодняшние задачи.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">План / факт по проектам</CardTitle>
            <CardDescription>Метрики месяца, агрегированные по всем проектам</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Скоро</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Сегодня</CardTitle>
            <CardDescription>Задачи на сегодня</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Скоро</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Где нужна помощь</CardTitle>
            <CardDescription>Запросы от продюсеров</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Скоро</CardContent>
        </Card>
      </div>
    </div>
  )
}
