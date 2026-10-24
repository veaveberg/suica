# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is currently not compatible with SWC. See [this issue](https://github.com/vitejs/vite-plugin-react/issues/428) for tracking the progress.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Teacher Telegram notifications

Each lesson schedules `notifications.deliverLesson` for one hour after it ends, using school time in Asia/Tbilisi. Creating, bulk generating, or changing a lesson schedules or replaces its reminder in the same Convex transaction. Unchanged schedule syncs reuse the existing job; cancellation or deletion cancels it. The minute polling cron has been removed. It reminds only when an active group has an active student without an attendance mark. Cancelled lessons are skipped; a completed lesson with missing marks still qualifies. Students added after the lesson are excluded. Reminders can catch up for 24 hours, so enabling this can notify about lessons from the previous day.

Configure these environment variables on the Convex deployment:

- `TELEGRAM_BOT_TOKEN`: the existing login bot token.
- `SUICA_APP_URL`: the published HTTPS app URL, including its hosting path.
- `TEACHER_NOTIFICATIONS_ENABLED=true`: enables delivery after deployment.

Deploy the Convex functions and schema with `npx convex deploy`. Teachers must allow messages from the bot or start its private chat. The login widget already requests write access. The message's "Mark attendance" button opens the Mini App with `tab=classes&lessonId=...`; the existing authenticated dashboard opens that lesson's attendance sheet after loading its data.

Delivery records live in `teacher_notifications`. Confirmed failures retry up to three times, at least five minutes apart. Blocked bots are not retried. A timeout has status `unknown` and is not automatically retried because Telegram may have already delivered it. A crashed action may leave `sending` for the same reason. Inspect these records before manually retrying an uncertain delivery. A sent reminder is never sent again for that lesson.

Run `node --test scripts/notifications.test.mjs scripts/lesson-reminders.test.mjs` to check timing and deep links. No test sends messages to teachers.

### Bot language

Users can send `/language`, `/settings`, or `/start` in the bot's private chat and select Русский, ქართული, English, Українська, or Беларуская. The bot stores the preference by Telegram user ID, including for users who have not logged into Suica yet. Initial selection follows Telegram's language, with English for unsupported languages. Once saved, the choice persists and is used for attendance messages and their buttons. The app's existing language setting stays separate.

Before enabling this on Telegram:

1. Configure a random `TELEGRAM_WEBHOOK_SECRET` on Convex.
2. Deploy the functions and schema.
3. Check the bot's current `getWebhookInfo` so an existing bot service is not accidentally replaced.
4. Register `https://<deployment>.convex.site/telegram/webhook` with Telegram's `setWebhook`, passing the same `secret_token` and `allowed_updates: ["message", "callback_query"]`.
5. Add `/language` to the bot command menu using BotFather or `setMyCommands`.

The webhook rejects requests without the configured Telegram secret and accepts language commands and callbacks only from private chats belonging to the sender. Repeated language updates do not overwrite newer choices. Registration and deployment are separate from local development; neither is performed by the tests.

Run `node --test scripts/bot-language.test.mjs scripts/notifications.test.mjs` for language, callback validation, reminder timing, and deep-link checks. Telegram API details: https://core.telegram.org/bots/api#setwebhook.

The developer account `129516266` can use `/test_notification` to receive the exact reminder for its latest ended, non-cancelled lesson. The test ignores lesson age, group archive state, and attendance completeness. It uses the saved bot language and real attendance link, and does not change normal reminder delivery records or lesson data. Duplicate Telegram updates are ignored and requests have a five-second cooldown. If the developer has no past lessons, the bot explains that instead.

After deploying this change, run the paginated `notifications:backfillReminders` internal mutation with `{ "cursor": null }` and then each returned cursor until `done` is true. Repeating the migration keeps the existing jobs. `notifications:auditReminderJobs` checks pending jobs against lesson due times. Confirmed failures schedule a five-minute retry instead of requiring a polling loop.

## Security maintenance

Use Node 24.13+ and `npm ci`. Run `npm run verify`, `npm run build`, and
`npm run security:check` before deployment. The security suite exercises
Telegram signatures, sessions, ownership checks, internal-only migrations,
the private calendar relay, and the loopback data server.

See [the security review](docs/security-review.md) for dependency exceptions,
deployment requirements, and verification limits. GitHub Actions runs these
checks on pull requests and weekly. Dependabot proposes weekly npm and Action
updates. Existing repository-wide lint errors are tracked separately.
