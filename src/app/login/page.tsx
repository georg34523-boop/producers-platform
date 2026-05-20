import { LoginForm } from './login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Producers Platform</h1>
          <p className="mt-1 text-sm text-muted-foreground">Войдите, чтобы продолжить</p>
        </div>
        <LoginForm nextPath={next ?? '/'} />
      </div>
    </main>
  )
}
