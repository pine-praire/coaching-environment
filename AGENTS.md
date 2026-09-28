# AGENTS.md — Апгар (apgar-insight)

Рабочее соглашение между Sasha и агентом (Claude Code). Читать до первой строки кода.
Глобальные правила — в `~/.claude/CLAUDE.md`; при расхождении приоритет у этого файла.

---

## Контекст

Платформа для работы с выгоранием: тесты (шкала Апгар, прокрастинация, «Burn out Бинго»),
история результатов в личном кабинете, админка.

- Прод: `apgar-insight.vercel.app`
- Репозиторий: `pine-praire/coaching-environment` (бывший `apgar-insight`, старый адрес
  перенаправляет) — **публичный**. Ничего секретного в git.
- Проект изначально сгенерирован в Lovable (`@lovable.dev/vite-tanstack-config`, папка `.lovable/`).

---

## Стек

| Слой | Выбор |
|---|---|
| Framework | TanStack Start + TanStack Router (file-based), React 19, TypeScript |
| Сборка | Vite 7 через `@lovable.dev/vite-tanstack-config` + `nitro({ preset: "vercel" })` |
| Стили | Tailwind 4, токены в `src/styles.css` |
| UI | shadcn/ui (Radix) в `src/components/ui/`, иконки `lucide-react` |
| Auth + DB | Firebase Auth + Firestore (`src/integrations/firebase/client.ts`) |
| Хостинг | Vercel |
| Тесты | Vitest + Testing Library, jsdom (`vitest.config.ts`, setup `src/test/setup.ts`) |

**Новые зависимости — только после обсуждения.**

---

## Устройство

- `src/routes/` — страницы: `index`, `auth`, `reset-password`, `dashboard`, `test`,
  `result.$id`, `procrastination`, `bingo`, `admin`, `privacy`.
- `src/routeTree.gen.ts` — **генерируется** роутер-плагином, руками не править.
- `src/lib/` — логика: `apgar.ts`, `procrastination.ts`, `auth.tsx` (контекст `useAuth`: `user`, `isAdmin`).
- `src/components/` — свои компоненты; `ui/` — только shadcn-примитивы.
- Админы: первого создать вручную в консоли Firebase (`user_roles/<uid>` = `{ role: "admin" }`),
  дальше — кнопками в `/admin`.

### Firestore-коллекции

`users`, `user_roles` (`{ role: "admin" }`, id документа = uid), `apgar_results`,
`procrastination_results`, результаты бинго (см. `src/routes/bingo.tsx`).

Правила безопасности — `firestore.rules`, деплой:
`firebase deploy --only firestore:rules --project samovyvoz-685ae`.
Файл заменяет правила проекта **целиком**: новая коллекция без правила в нём = запрещена.

---

## Правила

- `vite.config.ts`: Lovable-конфиг уже подключает tanstackStart, react, tailwind, tsconfig-paths
  и т.д. **Не добавлять эти плагины повторно** — сборка ломается.
- Firebase web-конфиг (`apiKey`, `projectId`) публичный по своей природе; защита данных —
  только правила Firestore. Любая новая коллекция = новый блок в `firestore.rules`.
- Проверки на клиенте (`isAdmin`, редиректы) — только UI. Доступ решают правила.
- `.env` не коммитится (в `.gitignore`).
- Тексты интерфейса — на русском.
- Никаких `console.log` в коммитах, кроме `console.error` на реальные ошибки.

---

## Проверка перед коммитом

```bash
npx vitest run       # скрипта test в package.json нет
npx tsc --noEmit
npm run lint
npm run build
```

---

## Наследие Supabase (до 2026-05-05)

До коммита `317d23f` проект жил на Supabase. Остатки: `src/integrations/supabase/`,
`@supabase/supabase-js` в зависимостях, папка `supabase/` с миграциями, тесты
`migration.test.ts`, `procrastination-migration.test.ts`, `routes/auth.test.tsx`,
`routes/reset-password.test.tsx`. Приложение этот код не импортирует.
`.lovable/plan.md` описывает Supabase-версию админки — неактуален.
Новые фичи на Supabase не строить.

---

## Открытые вопросы

| Вопрос | Статус |
|---|---|
| Удалить Supabase-код, пакет и папку `supabase/` | ждёт решения |
| `supabase/migrations/20260524000001_course_progress.sql` (модули курса, прогресс, дневник) — перенести на Firestore или удалить | ждёт решения |
| Менеджер пакетов: npm или bun (сейчас три lock-файла) | ждёт решения |
| `firestore.rules` в репозитории — задеплоить после сверки с текущими правилами в консоли | ждёт деплоя |
| Ошибки `tsc` в тестах (`admin`, `dashboard`, `bingo`, `procrastination-integration`) | не исправлено |
| Причина ухода с Supabase не записана | уточнить у Sasha |
| `wrangler.jsonc` остался от Cloudflare, деплой сейчас на Vercel | можно удалить |
