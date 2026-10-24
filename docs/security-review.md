# Security review, 24 October 2026

This report records the source changes and checks before deployment.
Publication and live verification are tracked in the deployment history. A clean dependency audit covers
known package advisories; it does not certify the application as vulnerability-free.

## Fixed in source

- Made the transfer, copy, and attendance migration functions internal. Browser
  clients can no longer invoke destructive migrations without deployment access.
  Migration scripts now use the authenticated Convex CLI and accept explicit
  source and target IDs instead of hardcoded live-account defaults.
- Added ownership checks for referenced lessons, students, groups, schedules,
  passes, and tariffs. Teacher authentication alone no longer permits writing
  attendance or associations against another teacher's records.
- Removed `ALLOW_INSECURE_TELEGRAM_AUTH`. Login always verifies Telegram's
  signature. Mini App identity and profile fields come from the signed payload,
  including the username used to link student records. Already linked students
  cannot be reassigned by a recycled Telegram username. Profile edits cannot
  change the Telegram username used for identity. Automatic teacher-side
  matching uses only usernames verified by a signed login. Older unverified
  usernames become eligible after the account signs in again. Duplicate parameters,
  missing signed users, stale dates, and dates over 30 seconds ahead are rejected.
- Moved authentication to actions so attempt counters commit separately before
  a failed login throws. The developer-secret endpoint has one global attempt
  budget, preventing target-ID changes from resetting it. Its secret must be at
  least 32 characters. It remains explicitly controlled by `ALLOW_BACKDOOR_LOGIN`.
- Required a dedicated session secret of at least 32 characters in every
  deployment. Removed the fallback to the Telegram bot token. Removed browser
  logging of Telegram signatures and session-bearing login responses.
- Bound the legacy JSON data server and Vite development server to loopback.
  Removed unrestricted CORS. The data server rejects unexpected Host and Origin
  headers and cross-site browser requests before accessing data. It remains a
  local utility, without production authentication.
- Removed public CORS proxy fallbacks that disclosed private calendar URLs.
  Calendars load directly from their publisher, then through an authenticated
  Convex relay if needed. The relay looks up an owned stored calendar, accepts
  only HTTPS Google Calendar, iCloud public-calendar, and Outlook publishers,
  rejects redirects, times out after 15 seconds, and caps responses at 5 MB.
  Other publishers work only when they allow direct browser CORS requests.
- Added a content security policy and `no-referrer` policy. Telegram's widget
  needs `unsafe-eval` for its callback; dynamic UI styles need `unsafe-inline`.
  Connection destinations include HTTPS calendar publishers and Convex sockets.
- Updated npm dependencies, removed the unused vulnerable Telegram SDK and CORS
  package, and declared the previously missing `concurrently` development tool.
  Preserved the removed Instagram SVG from Lucide 0.562.0 under its ISC license.
- Updated and pinned official GitHub Actions to verified release commit hashes,
  moved CI to Node 24, limited Pages deployment permissions to the deploy job,
  and added weekly dependency proposals, audits, and regression checks.

## Dependency exceptions

All retained dependencies are at the newest compatible versions in the lockfile.
Four packages intentionally stay behind their latest major:

| Package | Installed | Latest at review | Reason |
| --- | --- | --- | --- |
| `@fullcalendar/react` | 6.1.22 | 7.1.3 | Keep the existing calendar plugin suite on version 6. Version 7 uses a different core and headless calendar dependency. |
| `tailwindcss` | 3.4.19 | 4.3.3 | Version 4 changes styling defaults, configuration, and browser requirements. Preserve the current design and supported browsers. |
| `typescript` | 6.0.3 | 7.0.2 | Current typescript-eslint supports TypeScript below 6.1. |
| `@types/node` | 24.19.2 | 26.6.5 | Match the Node 24 CI runtime. |

Tailwind 3 and its PostCSS nesting plugin otherwise select a vulnerable version
of `postcss-selector-parser`. Scoped overrides select patched version 7.1.7.
The production build and rendered login/settings preview were checked with it.
Keep these overrides until a Tailwind migration removes the old dependency.
Tailwind's [upgrade guide](https://tailwindcss.com/docs/upgrade-guide) describes
the styling and browser changes. [Vite's migration guide](https://vite.dev/guide/migration)
describes the build changes in the installed Vite 8 release.

## Verification

- Baseline dependency audit: 26 affected packages, including 1 critical and
  19 high severity entries. Final full audit: 0 known vulnerabilities.
- A clean `npm ci`, production build, backend TypeScript check, translation
  check, and all 30 existing and security tests pass on local Node 26.7.0.
  These local checks used Node 26.7.0. Node 24 is configured for GitHub Actions. Tests use generated HMACs, actual Convex
  handlers with `convex-test`, and real requests to a temporary loopback server.
  The relay tests stub the remote publisher, not authorization or database logic.
- The built login page and settings were inspected in a browser. Language
  switching worked, and the inspected console had no warnings or errors.
  Telegram displayed `Bot domain invalid` on localhost, as expected for an
  unregistered login-widget origin. Full sign-in and authenticated calendars
  still require verification on the registered domain after deployment.
- Repository lint failed before this work with 103 errors and 11 warnings.
  This work leaves 95 errors and 11 warnings. Existing lint debt is not hidden
  or made a passing CI gate by disabling rules.
- The live site returned HTTPS 200 from GitHub Pages. Its inspected response
  did not include CSP, HSTS, X-Content-Type-Options, or Referrer-Policy headers.
  The new HTML adds CSP and referrer protection after frontend publication.
  Header-only protections, including HSTS and frame-ancestors, require hosting
  or proxy configuration outside these source changes.
- The pre-deployment function-spec check confirmed `users.login` was a public
  mutation and `migrations/transfer_user_data:transfer` was public. Post-deployment
  verification must confirm action-based login and internal migration visibility.

## Deployment and remaining checks

The website uses `flexible-leopard-684`, which is labeled a development deployment
but serves the published app. Environment labels must not control security.
The local `.env.local` and current CI configuration confirm this target.

The read-only environment check confirmed a session secret and webhook secret
of at least 32 characters, no insecure Telegram auth flag, and enabled developer
login with a secret of at least 32 characters. No secret values were logged or
changed. Keep developer login enabled only while it is needed; use a random,
independent secret rather than a memorable password.

Deploy the Convex runtime and frontend together. `users.login` and
`users.backdoorLogin` now use Convex actions instead of mutations, and the
calendar relay adds a backend action. Existing active sessions still use the
same signing format and configured secret. Cached old frontend code must reload
before signing in again against the new backend.

Do not blindly use `convex deploy` against the default production target:
confirm the intended live deployment, and use the CLI's explicit deployment
selection. This checkout also contains pre-existing uncommitted reminder/bot
work. Review that work before publishing the whole checkout. Code generation
updated local bindings during the source review.

After deployment, verify login through the registered website and Telegram Mini
App, teacher-owned attendance edits, calendar imports, and public availability.
Rotate any private calendar feed links previously disclosed to public proxies
through their publishers. This was not done automatically because changing a
feed token affects existing subscribers.

The frontend stores bearer sessions in localStorage. The content policy reduces
script injection risk, but a successful same-origin script injection or
compromised trusted Telegram script could still read sessions. A future
server-hosted session design can use HttpOnly cookies. This review did not add
that infrastructure or perform an independent penetration test.
