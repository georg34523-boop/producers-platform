import { Card, CardContent } from '@/components/ui/card'

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Проекты</h1>
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Этап 1 ТЗ v2: создание проекта, карточка проекта с вкладками (Обзор / Продукты / Трекер месяца / Юниты).
          Будет готово следующим заходом.
        </CardContent>
      </Card>
    </div>
  )
}
