import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const FRANKFURTER_URL = 'https://api.frankfurter.app/latest?from=USD&to=EUR'
const FALLBACK_RATE = 0.92
const MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 год

export type UsdEurRateInfo = {
  rate: number
  fetched_at: string
  source: 'cache' | 'live' | 'fallback'
}

/** USD → EUR курс. Кеш у currency_rates, оновлюємо раз на 24 год через ECB. */
export async function getUsdEurRate(): Promise<UsdEurRateInfo> {
  const supabase = await createClient()
  const { data: cached } = await supabase
    .from('currency_rates')
    .select('rate, fetched_at')
    .eq('base', 'USD')
    .eq('quote', 'EUR')
    .maybeSingle()

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at as string).getTime()
    if (age < MAX_AGE_MS) {
      return { rate: Number(cached.rate), fetched_at: cached.fetched_at as string, source: 'cache' }
    }
  }

  // Cache stale або відсутній → пробуємо live
  try {
    const res = await fetch(FRANKFURTER_URL, { cache: 'no-store' })
    if (res.ok) {
      const json = (await res.json()) as { rates?: { EUR?: number } }
      const rate = Number(json.rates?.EUR)
      if (Number.isFinite(rate) && rate > 0) {
        const now = new Date().toISOString()
        try {
          const admin = createAdminClient()
          await admin
            .from('currency_rates')
            .upsert(
              { base: 'USD', quote: 'EUR', rate, fetched_at: now },
              { onConflict: 'base,quote' },
            )
        } catch {
          // service-role не сконфігурований у dev — нехай, повернемо live
        }
        return { rate, fetched_at: now, source: 'live' }
      }
    }
  } catch {
    // мережа недоступна — впадемо на cache (навіть якщо stale) або fallback
  }

  if (cached) {
    return { rate: Number(cached.rate), fetched_at: cached.fetched_at as string, source: 'cache' }
  }
  return { rate: FALLBACK_RATE, fetched_at: new Date().toISOString(), source: 'fallback' }
}
