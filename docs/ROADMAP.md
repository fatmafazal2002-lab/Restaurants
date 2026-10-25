# Remaining work before the complete SaaS brief is fulfilled

The implemented MVP covers the core ordering workflow and initial administration. The following are not represented as completed features:

- Browser-level multi-device/reconnection testing and signup-email delivery checks. Hosted Auth, RPC workflow, Realtime, Storage and concurrent submission/transition checks now pass; see VALIDATION.md.
- Pagination and server-side reporting over full order history, popular items, customer directory, and full sales/performance reports. Active queues already load separately using cursor pagination.
- Staff invitation emails, password recovery, account conversion from anonymous guests, employee removal, and waiter table assignment UI.
- Table token rotation/session revocation controls and printable QR artwork. Current guest links can be reused by anyone who possesses them while a table remains active.
- Category edit/delete/reordering, item archival/deletion, video uploads, public verified dish-level reviews. Current feedback is a verified-order rating shown to the owner/admin and its author.
- Custom background uploads and downloadable custom font files. Per-restaurant logo and cover uploads, welcome copy, name, address, phone, primary/accent colors, independent body/heading fonts, presets, interface styles, density, avatar visibility, light/dark/device themes and grid/list menu layouts are implemented.
- Full German coverage for secondary copy and field labels. Primary workflow labels support English/German; menu content is restaurant-authored and is not automatically translated.
- Audible/push notifications, queue prioritization, and notification preferences. Current notifications are in-app live status updates, ready tickets and request badges.
- Subscription lifecycle/provider integration, platform settings, custom plan editor, quotas for order volume/media, and usage reporting.
- Privacy export/deletion workflows, retention automation, backup/restore validation, observability, load testing, CAPTCHA UI, abuse controls, security review, comprehensive accessibility audit and deployment monitoring.

Do not enable payment processing without a separate request. Supabase remains the only production backend.
