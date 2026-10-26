# Remaining work before the complete SaaS brief is fulfilled

The implemented MVP covers the core ordering workflow and initial administration. The following are not represented as completed features:

- Browser-level multi-device/reconnection testing and signup-email delivery checks. Hosted Auth, RPC workflow, Realtime, Storage and concurrent submission/transition checks now pass; see VALIDATION.md.
- Full restaurant history browsing, popular-item analysis, customer directory, and payment-based sales reports. Platform analytics aggregate database records for 7/30/90-day periods. Active queues already load separately using cursor pagination.
- Automatic employee invitation emails, self-service password recovery, account conversion from anonymous guests, and waiter table assignment UI. Temporary-password provisioning and mandatory first-login password/profile setup are implemented.
- Table token rotation/session revocation controls and printable QR artwork. Current guest links can be reused by anyone who possesses them while a table remains active.
- Category reordering, video uploads, public verified dish-level reviews. Current feedback is a verified-order rating shown to the owner/admin and its author.
- Custom background uploads and downloadable custom font files. Per-restaurant logo and cover uploads, welcome copy, name, address, phone, primary/accent colors, independent body/heading fonts, presets, interface styles, density, avatar visibility, light/dark/device themes and grid/list menu layouts are implemented.
- Restaurant-authored menu descriptions and package marketing descriptions need their own translations; system interface copy now supports English, German and Turkish.
- Audible/push notifications, queue prioritization, and notification preferences. Current notifications are in-app live status updates, ready tickets and request badges.
- Subscription lifecycle/provider integration and quotas for order volume/media. Platform analytics, package prices, capacity controls, feature catalogue and audit history are implemented.
- Privacy export/deletion workflows, retention automation, backup/restore validation, observability, load testing, CAPTCHA UI, abuse controls, security review, comprehensive accessibility audit and deployment monitoring.

Do not enable payment processing without a separate request. Supabase remains the only production backend.
