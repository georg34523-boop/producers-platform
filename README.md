# Producers Platform

Платформа для тим-лида, продюсеров и экспертов: трекинг проектов (запусков курсов / продуктов),
декомпозиция целей месяц→неделя, задачи на досках, очередь запросов помощи и база знаний по проекту.

## Стек

- **Next.js 16** (App Router, Server Components, Server Actions, `proxy.ts`)
- **React 19**, **TypeScript**, **Tailwind CSS v4**, **shadcn/ui** (нейтральная Б/Ч палитра)
- **Supabase** — Postgres + Auth + Storage + RLS
- **dnd-kit** — drag-and-drop для канбана
- **TanStack Query**, **react-hook-form**, **Zod**
- **grammY** (Telegram-бот для тим-лида) и **Google Sheets API** — будут добавлены
- Деплой: **Vercel** + **GitHub**

## Роли

| Роль | Доступ |
| --- | --- |
| `team_lead` | всё: видит и редактирует все проекты, цели, задачи; управляет ролями |
| `producer` | редактирует свои проекты (1–2), читает чужие; видит общий help-queue |
| `expert` | только свой проект |
| `member` | только тот проект, куда добавлен |

## Старт

### 1. Создать Supabase-проект

1. На supabase.com создать проект.
2. В **SQL Editor** прогнать содержимое `supabase/migrations/0001_init.sql`.
3. В **Project Settings → API** скопировать `Project URL` и `anon public` ключ.

### 2. Завести `.env.local`

```bash
cp .env.local.example .env.local
# подставить значения
```

### 3. Установить зависимости и запустить

```bash
npm install
npm run dev
```

Откроется на http://localhost:3000 — редирект на `/login`.

### 4. Создать первого пользователя (тим-лид)

В Supabase **Authentication → Users → Add user** (с паролем). Затем в **Table editor → profiles**
поменять `role` этого пользователя на `team_lead`. Дальше пользователей можно заводить из UI.

## Структура

```
src/
├── app/
│   ├── (app)/             # защищённый layout: дашборд, проекты, цели, помощь, команда
│   └── login/             # публичный логин (Server Action)
├── components/
│   ├── app/               # каркас приложения (sidebar, topbar)
│   └── ui/                # shadcn-компоненты
└── lib/
    ├── auth.ts            # requireProfile / getProfileOrNull
    ├── supabase/          # browser/server clients + proxy session refresh
    └── utils.ts
proxy.ts                   # Next.js 16: middleware → proxy
supabase/migrations/       # SQL-миграции (пока применяются вручную через SQL Editor)
```

## Roadmap (MVP)

- [x] Скелет: Next.js 16 + Supabase + RLS + auth + базовый layout
- [ ] CRUD проектов (создание тим-лидом, назначение продюсера/эксперта)
- [ ] Канбан задач: подзадачи, чек-листы, комментарии, повторяющиеся
- [ ] Цели: декомпозиция месяц→неделя, метрики план/факт
- [ ] Интеграция с Google Sheets (auto-pull `actual_value`)
- [ ] Дашборд тим-лида (план/факт по проектам, «сегодня», help-очередь)
- [ ] Help-очередь (видна тим-лиду + продюсерам)
- [ ] Telegram-бот тим-лида
- [ ] База знаний: файлы с описанием в Supabase Storage
- [ ] PWA-обвязка
- [ ] История месяц-к-месяцу с графиками
