# Engineering Decisions

**PostgreSQL.** The data is relational (one user → many inquiries) and the core access rule is a `WHERE` clause. Foreign keys, `CHECK` constraints and ENUMs let the database itself reject bad data even if application code has a bug.

**`pg` instead of an ORM.** There are few queries, and the most important one (access control) should be visible, not generated. All SQL lives in two repository files and uses `$n` placeholders; dynamic filters add only placeholders to the SQL text, never user input.

**JWT.** Stateless Bearer tokens suit a separate SPA and API: no session store, and the same header works from the browser, Postman and tests. Tokens hold only `userId` and `email`, use HS256 (pinned on verify), expire after 1 hour, and their payload is re-validated. The frontend stores the token in `localStorage` so refreshes keep the session; XSS could read it, which React's output escaping and the short lifetime mitigate. An httpOnly cookie would be the production upgrade.

**Public vs. Private and ownership.** Public inquiries can be viewed, edited and moved through statuses by any staff member; Private ones only by their creator. `created_by` always comes from the verified token (a client-sent `created_by` or `status` is rejected with 400). Every inquiry query — list, count, search, read, update, status change — contains `(visibility = 'Public' OR created_by = $userId)`, so no endpoint can forget the rule. Frontend route guards are only a convenience.

**ENUM types** for status and visibility: small, fixed value sets that the database enforces without lookup-table joins; mirrored as TypeScript constants and Zod enums. Adding a value needs a migration, acceptable for a stable workflow.

**Status transitions.** `New → In Progress → Resolved`, and `Resolved → In Progress` (reopen); repeating the current status is a no-op; anything else returns 400. The rule lives in the service layer. The write is compare-and-set (`… WHERE status = <the status just validated>`), so a concurrent change makes it match 0 rows and return 409 instead of applying a transition validated against stale data.

**Duplicate inquiries** are allowed: a customer may legitimately raise similar inquiries and there is no reliable natural key, so a uniqueness rule would reject valid data. Double submits are prevented in the UI by disabling the button while saving.

**Stale data across tabs.** No WebSockets or polling (out of scope). Views refetch when their tab regains focus and have a Refresh button showing the last load time. Edits send `expected_updated_at`; if the row changed since, the API returns 409 and the UI says the changes were not saved and offers "Reload latest". All writes go directly to PostgreSQL. Accepted limitation: a tab can *show* old data until refreshed, but cannot silently overwrite newer data.

**Trade-off: 404 instead of 403 for other staff's Private inquiries.** 403 is easier to debug but confirms the inquiry exists. We chose privacy: missing and forbidden ids get the same 404, and server logs remain for troubleshooting.

**AI tools.** Claude Code was used as a pair programmer: planning the phases, drafting files, and writing and running verification after each phase (Jest, API scripts, headless-browser checks against a separate test database).
- *Accepted:* 404-not-403 for Private inquiries; the compare-and-set status update.
- *Changed:* the AI's first `requireJson` middleware returned 415 for empty POST bodies, so unauthenticated requests got 415 instead of 401. The tests caught it and it now rejects only non-empty, non-JSON bodies. The tests also caught a post-login redirect race in the frontend.
- *Rejected:* TanStack Query, in favour of Axios and a small custom hook that is easier to explain. TypeScript 7 (installed by default) was pinned to 5.9 in the backend because `ts-jest` does not support it yet.

Every AI-generated change was reviewed and verified by running it.
