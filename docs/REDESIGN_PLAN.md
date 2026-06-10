# PokerGrid: Assessment & Fresh-Repo Redesign Plan

## Context

PokerGrid (pokergrid.pages.dev) is a 5×5 poker-solitaire daily puzzle built on Expo/React Native + react-native-web, deployed to Cloudflare Pages with a Supabase leaderboard. The owner asked for (1) an assessment of the current UI/UX/layout, (2) a diagnosis of the intermittent "daily score doesn't save / gets hung up" bug, and (3) a plan for a complete redesign **in a fresh GitHub repository** (the original site keeps running). Confirmed decisions:

- **Stack:** web-first React — Vite + React + TypeScript, real DOM/CSS (no react-native-web)
- **Aesthetic:** clean editorial (NYT Games-style) — paper-white, ink text, classic card faces
- **Backend:** reuse the **same** Supabase project/schema/RPCs (shared leaderboards across both sites)
- **Plus:** a small surgical patch in the *current* repo to fix the score-save hang now

---

## Part 1 — Assessment of the current game

### What's genuinely good
- **Pure game core** (`src/game/`): no React/RN imports anywhere (verified — ports verbatim), reducer-driven `state.ts`, deterministic daily seeding (FNV-1a), injectable RNG, Shapley-value bonus attribution, 23 test files including bot-simulation balance tests. This is the asset to preserve.
- **Centralized design tokens** (`src/ui/theme.ts`) consumed consistently across ~40 components.
- Cohesive (if loud) neon identity; good haptics/sound/animation feel; accessibility *settings* exist (two-color deck, color-blind assist, reduce motion).

### UI/UX/layout problems
1. **The web experience is a scaled phone app.** Fixed 390px portrait layout shrunk via CSS `transform: scale()` (`WebScaler`, App.tsx:325–383). Desktop gets a small phone column with dead space — no responsive layout exists.
2. **No URLs.** Hand-rolled `screen` state in App.tsx (660 lines, manual "return path" bookkeeping). No deep links to archive dates, results, or rules; refresh/back break flow.
3. **Neon-dark fights the genre.** Daily puzzles thrive on a calm, daily-ritual feel; saturated glows on near-black (#06070d) are fatiguing, and secondary CTAs (#646b8c on #0d111c) fall below WCAG AA contrast.
4. **In-game information overload:** 6+ stacked modals, hint arrows, bonus strip, perk buttons, and phase-dependent UI in one 390px column. Desktop space could make the lines breakdown and deck info persistent panels instead of modals.
5. **Ad-hoc loading/error states** — bespoke text per component, no skeletons, no standardized retry UX.
6. **Accessibility semantics are shallow:** only 2 `accessibilityLabel`s app-wide, no SR announcements for game events, no keyboard navigation.
7. **Theme leaks:** modal backdrop rgba values, bonus-category colors (`bonusCardCategory.ts`), two-color deck palette (inside `CardTile.tsx`) live outside `theme.ts`.

### Code-structure problems
1. **`GameScreen.tsx`: 3,277 lines, 53 hooks** — grid, phases, modals, hints, animation, sound, gestures in one file; `AnimationLayer.tsx` (682 lines Reanimated) tightly coupled to it.
2. **`ResultScreen.tsx` (1,241)** mixes Targets-Up reward logic with presentation.
3. **Prop drilling + 4 manually wired contexts**; every new screen edits the App.tsx shell.
4. **17 modals, no shared base component** — duplicated backdrop/header/close boilerplate.
5. **Fragile daily sync queue** (root of the bug below).

---

## Part 2 — Why daily scores sometimes don't save (verified in code)

Flow: game ends → ResultScreen fires `daily.recordCompletion()` (fire-and-forget, ResultScreen.tsx:616–629) → saves locally → calls `submitDailyPlay` RPC (20s timeout) → **only on failure** does it `enqueuePendingSubmit` → RankPanel polls rank via `useDailyRank`.

**Root causes, ranked:**

1. **Submit-then-enqueue ordering (the smoking gun)** — `DailyProvider.tsx:281–357`. The play enters the durable retry queue only *after* a failed 20s submit. If the PWA tab/app closes (or navigates) during that window, the score is saved locally but is **neither on the server nor in the queue** — and RankPanel's "tap to retry" only drains the (empty) queue, so the score can never reach the leaderboard. Permanent hang.
2. **`fetchRank` has no timeout** (`supabase.ts:155–175`) — a hung connection leaves `useDailyRank` in `loading` forever → stuck "Fetching leaderboard…".
3. **`drainQueue` has no re-entrance guard** (`DailyProvider.tsx:172–223`) — initial drain, AppState listener, and retry taps overlap, racing the AsyncStorage read-modify-write in `enqueuePendingSubmit`/`removePendingSubmit` (localStore.ts:156–181); entries can be lost or double-submitted.
4. **Retry tap is a no-op during the first 20s** (offered at 10s; nothing queued until 20s). Fixed automatically by #1.
5. **On web/PWA the foreground drain may never fire** (AppState 'active' ⇒ visibilitychange; a focused tab never triggers it; no `online` listener).
6. Minor: the 20s `setTimeout` in `Promise.race` is never cleared.

---

## Part 3 — Patch to THIS repo (fix the hang now; ship first, independently)

No schema/RPC changes — the server's `(device_id, date)` unique constraint + `AlreadySubmittedError` (23505) make everything idempotent.

1. **`src/ui/daily/supabase.ts` — `withTimeout` helper** (fixes #2, #6): a generic `withTimeout(promise, ms, makeErr)` that clears its timer in `finally`. Use it in `submitDailyPlay` (replacing the inline race at lines 124–127) and wrap `fetchRank` with a 10s `RankFetchTimeoutError`. `useDailyRank` already maps any throw to `status: 'error'`, so the hang becomes a retryable error with no hook changes.
2. **`src/ui/daily/DailyProvider.tsx` — queue-first `recordCompletion`** (fixes #1, #4): `savePlay` → `setPlays` → `await enqueuePendingSubmit(...)` **before any network attempt** → `void drainQueue()` (not awaited; result screen renders immediately). Deletes the duplicated submit/error branch — `drainQueue` already implements identical success/AlreadySubmitted/transient-failure semantics. Tab closes mid-submit → entry is already on disk → next launch drains it; retry tap always has something to retry.
3. **`DailyProvider.tsx` — ref-based drain re-entrance guard with rerun-coalescing** (fixes #3): `drainRef = useRef({ running: Promise|null, rerun: bool })`; concurrent callers return the in-flight promise and set `rerun` so an enqueue landing mid-drain isn't missed (`do { await drainOnce() } while (rerun)`).
4. **`DailyProvider.tsx` — web `online` listener** (fixes #5): on `Platform.OS === 'web'`, `window.addEventListener('online', () => void drainQueue())`.
5. **Tests:** extract `drainOnce` into `src/ui/daily/submitQueue.ts` as a plain async fn with injected deps `{ getPendingSubmits, removePendingSubmit, submit }` → `{ anySubmitted, lastError }`. New `__tests__/dailyQueue.test.ts` (existing jest-expo patterns + async-storage mock): queue idempotency; drain success / AlreadySubmitted / transient / BackendUnavailable paths; **regression test: a rejecting submit still leaves the entry queued** (queue-first ordering); `withTimeout` with fake timers (asserts timer cleanup).

No changes to `useDailyRank.ts` or `RankPanel.tsx`.

**Verify:** new tests green; manual DevTools-offline test — finish a daily offline, kill tab, relaunch → score submits; retry tap works mid-flight.

---

## Part 4 — Fresh repo (`pokergrid-web`)

### 4.1 Stack (one choice per decision)
| Concern | Choice | Why |
|---|---|---|
| Build | Vite 7 + React 19 + TS 5.9 strict | React 19 already in use |
| Routing | react-router v7, library mode | 10 routes, one dynamic date segment; no SSR needed on static CF Pages |
| Styling | CSS Modules + CSS custom properties (`design/tokens.css`) + typed `tokens.ts` mirror | Token-heavy editorial system *is* CSS variables; zero runtime; native dark-mode path later via `[data-theme]` |
| Game state | Keep the pure ported reducer; `useReducer` in a `GameSessionProvider` | `state.ts` is the crown jewel; no store library should own it |
| App-shell state | zustand v5 + `persist` (localStorage) for settings/stats/achievements/Targets-Up/plays/queue | Versioned migrations free; replaces ad-hoc AsyncStorage wrappers |
| Server data | TanStack Query v5 over the same Supabase RPCs | retry/backoff, `refetchOnReconnect`, cache per `['daily-rank', date, deviceId]` |
| Testing | Vitest (`globals: true`; node env for game, jsdom+Testing Library for UI) + Playwright E2E | 21 of 23 test files port with import-path changes only; 2 need `jest.`→`vi.` |
| Animation | motion v12 (`motion/react`) for card travel/modals; CSS for everything simple | See 4.3 |
| PWA / deploy | vite-plugin-pwa (autoUpdate; `NetworkOnly` for `*.supabase.co`); Cloudflare Pages new project; port `functions/share` OG-image function | Same hosting model |

### 4.2 Code organization & IA
Feature folders; every screen deep-linkable:

```
src/
  game/            # PORTED VERBATIM (+ its 23 tests; zero source changes needed)
  lib/             # supabaseClient, typed sync localStorage helpers, time
  design/          # tokens.css, tokens.ts, typography, reset, primitives/
                   #   (Button, Dialog [native <dialog>], Sheet, Tabs, Toast)
  app/             # router, providers, AppLayout (responsive chrome)
  features/
    home/  game/  daily/  results/  stats/  achievements/
    challenges/  targets/  rules/  settings/
```

Routes: `/` home · `/play?difficulty=hard` free play · `/daily` today · `/daily/:date` (renders the stored result if already played — shareable/revisitable) · `/daily/archive` · `/stats` · `/achievements` · `/challenges` · `/targets` · `/rules` · `/settings`. Result renders inside `/play` and `/daily/:date` at game-over (not a separate route).

**GameScreen decomposition rule:** split along the phase union. `GameSessionProvider` owns `useReducer` + dispatch; `usePhaseUI` is the *only* place switching on `state.phase`, returning a discriminated "ui mode"; each modal/overlay consumes its slice. Components: `GridBoard/GridCell/CardFace`, `DeckTray/NextCardWell`, `ScoreBar`, `PerkBar`, `BonusCardStrip`, `LineRails`, plus a one-for-one modal inventory rebuild. **No component over ~250 lines; handlers live in hooks, not JSX.**

**Daily sync rebuilt queue-first from day one** (`features/daily/sync/`): `deviceId.ts`, `playsStore.ts` (zustand persist), `queue.ts` (pure enqueue/remove/drainOnce with injected submit + module-level drain guard with rerun flag), `rpc.ts` (RPC wrappers + `withTimeout` + typed errors), `useSubmitDaily.ts` (save → enqueue → drain), `useDailyRank/useDailyStats` (TanStack Query). Drain triggers: app start, `onlineManager` reconnect, manual retry.

### 4.3 Animation (replaces the 682-line Reanimated AnimationLayer)
- motion `layoutId` FLIP: drawn card in `NextCardWell` and target `GridCell` share `layoutId={cardId}` — placement, Hop/Slide moves, and Destroy (`AnimatePresence` exit) come nearly free.
- CSS transitions/keyframes: next-fill pulse, line-complete sweep, button presses; rAF hook for score ticker; CSS 3D `rotateY` card flip.
- Global `prefers-reduced-motion` guard in `anim/` utilities.

### 4.4 Design system — "Morning Paper" editorial tokens
```
Surfaces   --paper:#faf7f1  --paper-raised:#ffffff  --paper-sunken:#f2ecdf
           --felt:#1f5d43 (board accent surface, sparing)
Ink        --ink:#1a1a1a  --ink-2:#5f5a51  --ink-3:#938c7d
           --hairline:rgba(26,26,26,.14)  --rule:#d9d1c0
Card faces --card-face:#fffdf8  --card-red:#b3262e  --card-black:#1f1f1f
           --card-back:#28486e (engraved navy pattern)
Suit chips --suit-h:#b3262e --suit-d:#1d5fa0 --suit-c:#2f7d4f --suit-s:#1f2937 --joker:#6d4fa3
Signals    --accent:#1f5d43  --warn:#b07d2e  --danger:#9a2433  --success:#2f7d4f
Difficulty easy:#2f7d4f medium:#b07d2e hard:#c2542e extreme:#9a2433
Spacing    4/8/12/16/24/32/48 (keep names xs…xxl)   Radius 2/6/10/16/pill
Shadows    sm/md/lg soft ink shadows — no glows
```
- **Type:** Fraunces (variable serif) for display/hero score/card indices; Inter for body/UI with tabular numerals on all counters. Keep old text-role names (`hero/title/section/body/label/value/rank*`) as utility classes.
- **Card faces stay classic red/black**; suit identity for perks moves to a small four-color corner chip. Translation rule: every old glow becomes a hairline ring + `color-mix` tint (ambient) or a solid 2px ring (focal: next-fill cell, selection).

### 4.5 Responsive layout
- **<640px:** single column — header / score bar / grid (`min(100vw−32px, 440px)`) / next-card + perks / bonus strip; bottom sheets instead of center modals; ≥44px touch targets.
- **640–1023px:** same column, grid to 520px, bonus strip 2-row.
- **≥1024px:** CSS grid `minmax(260px,1fr) auto minmax(260px,1fr)` — left panel: score + **live 10-line breakdown** (today's tap-to-open modal becomes a persistent surface); center: grid + next-card well; right panel: deck info, bonus cards, perks. Container queries size board cells independently of viewport.

### 4.6 Migration / coexistence
- Same Supabase project, zero schema changes; both sites submit to `daily_plays` keyed `(device_id, date)` — safe by construction. A player on both domains = two leaderboard entries (acceptable).
- **Device identity: accept fresh identity on the new domain** (no handle-claim flow in v1 — handles are device-bound; a transfer mechanism would need a new RPC + proof, disproportionate now). Handle-taken error copy points users to clear their handle on the old site. A later `transfer_handle(claim_code)` RPC is a clean add if demand appears.
- Old site stays untouched (besides Part 3); optionally gains a banner linking to the new site at launch.

### 4.7 Phased milestones
- **Phase 0 — old-repo patch** (Part 3). Verify per Part 3.
- **Phase 1 — scaffold + core:** new repo, Vite/router skeleton, tokens + primitives, `src/game` port, Vitest, CI, CF Pages previews. *Verify:* 21 ported game tests green; preview renders a token-gallery page.
- **Phase 2 — playable game:** GameSessionProvider, board components, phase modals, card-travel animation, free play (all 4 difficulties), result view with line breakdown + Shapley attribution, desktop layout. *Verify:* full games at 390px and 1280px; Playwright deterministic seeded game to completion; Lighthouse mobile ≥90 perf/a11y.
- **Phase 3 — daily + leaderboard:** queue-first sync, query hooks, RankPanel/Histogram/TopScores/HandleEditor, `/daily`, `/daily/:date`, archive. *Verify:* queue unit tests (offline→online, already-submitted, timeout); Playwright submit-fail→retry; cross-check a new-site score appears ranked on the old site (shared backend parity).
- **Phase 4 — progression:** stats, achievements, challenges, Targets-Up (port save format), rules/tutorial. *Verify:* stats math vs old `statsTiers` expectations.
- **Phase 5 — polish + launch:** PWA offline shell + update toast, share cards + OG function, reduced-motion pass, dark-mode-ready token audit, custom domain. *Verify:* installable PWA, offline cold-start free play, OG unfurl, clean axe audit.

### Critical reference files (current repo)
- `src/ui/daily/DailyProvider.tsx`, `src/ui/daily/supabase.ts`, `src/ui/daily/localStore.ts` — Part 3 targets; blueprint for `features/daily/sync`
- `src/game/state.ts` — ported verbatim; spine of `GameSessionProvider`/`usePhaseUI`
- `src/ui/screens/GameScreen.tsx` — its phase-driven interactions define the new component inventory
- `src/ui/theme.ts` — token vocabulary carried over, values replaced by the editorial palette
