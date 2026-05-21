import 'server-only'

import { createClient as createSupabase } from '@supabase/supabase-js'

/**
 * Admin (service_role) client — bypasses RLS. Use only in server actions/route handlers
 * after verifying the caller's role (e.g. requireProfile + role === 'team_lead').
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in env. Throws a clear error if missing.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY не задан в .env.local. Добавь secret-ключ из Supabase (Settings → API Keys → secret).',
    )
  }
  return createSupabase(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
