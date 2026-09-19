# Community operations release

Social account verification controls a public badge only. It does not gate account activation, community visibility, campaign participation or withdrawals. Financial and moderation checks remain in place.

## Messaging

All active clipper and creator role pairs can message each other. New conversations respect the recipient's profile preference: request first (default), direct messages, or closed to new conversations. A pending request permits exactly one introductory message. Only the recipient accepts or declines; either member can block further messages without deleting history. Existing conversations are not closed by changing the preference.

Messages cannot be edited or deleted through the application. SQLite triggers enforce append-only message history. Messages are stored in the persistent database, included in backups, and survive restarts. Users see the retention and administrator-access notice before initiating a conversation and in the inbox/profile. This is not end-to-end encryption.

The owner administrator has a searchable, paginated chat log. Opening a conversation adds an audit entry, throttled to one per administrator/conversation per five minutes. The UI polls open conversations every five seconds; it does not claim instant websocket delivery. Regular users cannot access other conversations or administrator routes.

## Notifications and reports

Notifications are generated transactionally for message requests/messages, accepted requests, clip changes, campaign changes, deposit/withdrawal decisions and support replies. Deadline notices are generated when notification data is requested for a draft or ready clip due within 24 hours. These are in-app notices, not email/SMS/push delivery.

Profile, clip and message reports carry a reason, category and server-side evidence snapshot. A message can only be reported by a conversation participant. Moderation decisions require a note, are audited and notify the reporter. Account suspension remains an explicit administrator action in user management.

## Campaign preparation

Creator accounts can use three editable starting briefs and save incomplete private campaign drafts without reserving funds. The administrator sees a launch checklist, creators and balances, drafts and campaign statuses. Drafts are never public campaigns. Actual launch still requires a real creator, rights-cleared source, creator-approved prices/limits and funded balance; normal review and budget reservation apply.

## Earnings

The calendar separates measuring estimates, review estimates, current withdrawable balance, past settled clips and money reserved for pending withdrawals. Reaching the end of the 14+7 day window does not credit funds automatically; an administrator must finalize the earnings after review.

## Backups and recovery

When the production server starts, it checks for a backup less than 24 hours old, then checks hourly. The most recent seven archives are retained in DATA_DIR/backups. Each archive contains a consistent SQLite backup, referenced receipt/avatar files, SHA-256 hashes, row counts and the ledger total. Creation extracts the archive into a temporary directory and verifies all hashes, SQLite integrity, foreign keys and record counts before marking it successful.

Administrator downloads and verification actions are audited. Backups include sensitive account, session, payment and message data; keep downloaded archives in restricted storage outside the hosting volume. Same-volume snapshots alone do not survive complete volume loss. Offsite transfer is not configured by this release.

For disaster recovery, stop the application and preserve the old DATA_DIR. Extract a verified archive into a NEW empty data directory, verify its manifest and database integrity, and start the same application release pointed at that directory. Check users, messages, ledger counts and balance totals before routing traffic. No endpoint overwrites the live database. The admin "verify restore" operation only restores to a disposable directory.

## Verification

- Production build and TypeScript.
- Financial flow, immutable ledger, budget and payout tests.
- Registration, session and role isolation tests.
- Community profile, avatar and public/private-field tests.
- Community operations API tests: all member-role pairs, request policies, consent, blocks, suspended accounts, ownership, idempotent messages, immutable history, pagination, admin audit, notification/report ownership, private campaign drafts, backup extraction and restart persistence.
