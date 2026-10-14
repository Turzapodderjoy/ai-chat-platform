# UI Form Audit — ai-chat-platform/repo

Scope: `apps/web` (non-vendor). Re-audited after the Bay Console redesign.
All forms are native React/HTML — no `react-hook-form`, no `zodResolver`, no file uploads.

Total forms: **4** (the baseline audit found 3; `app/track/[token]/page.tsx` gained a
labelled reply form during the redesign).

---

## 1) `app/home-client.tsx` — Login

- Form: `app/home-client.tsx:109` — `onSubmit={enter}`, `noValidate`, `data-allow-autofill`
- Purpose: username/password sign-in
- Inputs:
  - `username` — text, `id`/`name="username"`, `autoComplete="username"`, `required`
  - `password` — password, `id`/`name="password"`, `autoComplete="current-password"`, `required`
  - `remember` — checkbox, `id`/`name="remember"`
- Labels: explicit `<label htmlFor>` for all three
- Validation: client-side empty check in `enter()`; server error surfaced via `error` state
- Submission: async; sets `submitting`, disables the button, shows "Signing in…"
- Errors: `role="alert"` + `id="login-error"`; both fields set
  `aria-invalid` and `aria-describedby="login-error"` when `error` is set
- a11y: verified in-browser — empty submit yields `aria-invalid="true"` on both fields,
  `aria-describedby` resolving to the alert node
- Auth/CSRF: POSTs to `/api/auth/login`, cookie session; no visible CSRF token
  (relies on SameSite cookies)
- Notes: no forced autofocus; "Forgot password" surfaces an inline explanation rather
  than a mail link

## 2) `app/track/page.tsx` — Tracking lookup

- Form: `app/track/page.tsx:50` — `onSubmit={handleSubmit}`, `noValidate`
- Purpose: resolve a repair by tracking code
- Input: single text, `id="tracking-code"`, `autoFocus`, uppercased on change,
  monospace (intentional — the code is an identifier)
- Labels: explicit `<label htmlFor="tracking-code">Tracking code</label>`
  (was placeholder-only in the baseline audit)
- Validation: empty-state disable + trim check
- Errors: `role="alert"` + `id="track-error"`; input gets `aria-invalid` and
  `aria-describedby="track-error"`
- a11y: verified in-browser — empty submit marks the field invalid and wires the description
- Notes: bad codes navigate to `/track/<code>`, where the not-found message is a
  `role="alert"` region

## 3) `app/track/[token]/page.tsx` — Customer reply

- Form: `app/track/[token]/page.tsx:464` — `onSubmit={sendReply}`
- Purpose: customer replies to the repair shop on the public tracking page
- Input: `id="reply"`, text, `autoComplete="off"`, disabled while sending
- Labels: explicit `<label htmlFor="reply">Message</label>`
- Validation: submit disabled when `sending` or `reply` is blank
- a11y: submit is `type="submit"`; the surrounding thread is the status context

## 4) `components/ItGuyPanel.tsx` — Ops chat

- Form: `components/ItGuyPanel.tsx:241` — inline `onSubmit` → `send()`
- Purpose: send instructions to the ops/agent ("IT guy") from the dashboard
- Input: controlled, `className="ops-chat-input"`
- Labels: `aria-label="Instruction for the IT guy"`
  (baseline audit flagged this as placeholder-only — now resolved)
- Validation: trim inside `send()`; button disabled while `busy`
- Errors: the async ops failure region is `role="alert"` (`field-error`), so gateway
  check failures are announced

---

## Summary

All 4 forms are native, all call `preventDefault`, all have accessible names, and every
error surface is a live region. Remaining known gaps:

- No `react-hook-form`/`zod` schema validation anywhere — validation is hand-rolled per form.
- Login relies on SameSite cookies rather than an explicit CSRF token.
- No file-upload form in the app (`ChatWidget` uses a hidden, `aria-label`ed file input
  driven by a visible button).
- Authenticated forms are covered by TypeScript and ESLint only; no DOM-level automated
  tests, so the browser checks above were run manually against a production build.
