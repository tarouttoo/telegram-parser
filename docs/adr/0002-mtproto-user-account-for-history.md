# MTProto user account for history access

The Telegram Bot API cannot read channel history at all, so a full Backfill of
Channel Posts is impossible with a bot. We use MTProto under a user account
(GramJS, matching the repo's TypeScript stack) with a one-time `api_id` /
`api_hash` login; the session is stored in a local file. Parsing runs locally,
not in GitHub Actions: Telegram rate-limits and often bans logins from
datacenter IPs, and a personal session has no business living in CI secrets.
CI remains for pipeline code review and tests only.

## Considered options

- **Bot API** — rejected: no method to fetch message history; only live
  updates.
- **Telethon (Python)** — functionally equivalent to GramJS, rejected only for
  stack mismatch with the TypeScript repo.
- **Run backfill in GitHub Actions** — rejected: datacenter-IP bans and
  session-secret exposure.
