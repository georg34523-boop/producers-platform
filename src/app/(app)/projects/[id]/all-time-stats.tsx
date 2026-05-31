import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CountUp } from '@/components/ui/count-up'
import { MONTH_LABEL_RU } from '@/lib/labels'
import type { ProjectAllTimeTotals } from '@/lib/queries/tracker'

function fmtMonth(ym: { year: number; month: number }): string {
  return `${MONTH_LABEL_RU[ym.month]} ${ym.year}`
}

export function AllTimeStats({
  totals,
  outstandingReceivable,
}: {
  totals: ProjectAllTimeTotals
  outstandingReceivable: number
}) {
  if (totals.months_count === 0) return null
  const monthsWord =
    totals.months_count === 1 ? 'місяць' : totals.months_count < 5 ? 'місяці' : 'місяців'
  const period =
    totals.first_month && totals.last_month
      ? totals.first_month.year === totals.last_month.year &&
        totals.first_month.month === totals.last_month.month
        ? fmtMonth(totals.first_month)
        : `${fmtMonth(totals.first_month)} — ${fmtMonth(totals.last_month)}`
      : ''

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-2 text-base">
          <span>Всього по проєкту</span>
          <span className="text-xs font-normal text-muted-foreground">
            {period} · {totals.months_count} {monthsWord}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-5">
          <AllTimeTile label="Виручка" suffix=" $" value={totals.revenue} />
          <AllTimeTile
            label="Дебіторка (актуальна)"
            suffix=" $"
            value={outstandingReceivable}
            tone={outstandingReceivable > 0 ? 'amber' : 'muted'}
          />
          <AllTimeTile label="Продажі" suffix=" шт" value={totals.sales} />
          <AllTimeTile label="Заявки" value={totals.applications} />
          <AllTimeTile label="Трафік" suffix=" $" value={totals.traffic_spend} />
        </div>
      </CardContent>
    </Card>
  )
}

function AllTimeTile({
  label,
  value,
  suffix,
  tone = 'default',
}: {
  label: string
  value: number
  suffix?: string
  tone?: 'default' | 'amber' | 'muted'
}) {
  const toneClass =
    tone === 'amber'
      ? 'text-amber-600 dark:text-amber-400'
      : tone === 'muted'
      ? 'text-muted-foreground'
      : ''
  return (
    <div className="rounded-md border bg-card/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${toneClass}`}>
        <CountUp value={value} suffix={suffix} />
      </div>
    </div>
  )
}
