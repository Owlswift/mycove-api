# MyCove Analytics Event Dictionary

Single source of truth for every Mixpanel event across the three surfaces.
Every event follows `area_object_outcome` snake_case naming; one event per
outcome with distinguishing **properties** (never one event per variant —
`airtime_purchase_success` + `network=MTN`, not `mtn_airtime_purchase`).

**Layers**

| Layer | Surface | Wrapper | Token source |
|---|---|---|---|
| Frontend | Flutter app | `lib/core/analytics/analytics_service.dart` | `--dart-define=MIXPANEL_TOKEN` (fallback: baked default) |
| Backend | NestJS API | `src/common/analytics/analytics.service.ts` | `MIXPANEL_TOKEN` env |
| Admin | Next.js dashboard | `lib/analytics.ts` | `NEXT_PUBLIC_MIXPANEL_TOKEN` env |

**Identity:** identified by userId on login/bootstrap; super properties
`estate_id`, `estate_name`, `role`, `platform`, `environment`; identity reset
on logout.

**People profiles (backend):** backend events attributed to a real user
(`payment_initiated`, `payment_success`, `payment_failed`,
`wallet_transaction`) go through `AnalyticsService.trackUser`, which also
upserts that user's Mixpanel people profile — `$name`/`full_name`,
`$phone`/`phone`, `estate_id`, `estate_name` (their estate) — pulled fresh
from the database on every event, so each person object always carries their
fullname, phone number, and the estate they belong to. Never use plain
`track` for user identities on the backend.

**Global properties (auto-attached to every event):**

| Property | Source |
|---|---|
| `user_id` | Flutter identify / backend distinct_id |
| `estate_id` | Flutter identify / backend event prop |
| `user_role` | Flutter identify |
| `session_id` | Flutter session UUID |
| `platform` | Flutter device info |
| `app_version` | Flutter package info |
| `os_version` | Flutter device info |
| `device_model` | Flutter device info |
| `environment` | Flutter `FLUTTER_ENV` / backend `NODE_ENV` / admin `NODE_ENV` |
| `request_id` | Backend only |
| `service` | Backend only (`mycove-api`) |
| `admin_id` | Admin only |
| `admin_role` | Admin only |

**Privacy guardrails (enforced in wrappers):**
- Voice transcripts truncated to 120 chars; digit-runs ≥ 7 chars (meter/phone numbers) redacted
- Never sent as properties: passwords, PINs, tokens, full phone numbers, meter numbers
- Full voice transcripts stay in the backend database — Mixpanel only gets analytical summaries

---

## Authentication (mobile)

| Event | Trigger | Properties |
|---|---|---|
| `signup_started` | Signup form opened | signup_method, platform |
| `signup_completed` | Signup succeeded | signup_method, referral_source, duration_ms |
| `login_success` | Login succeeded | login_method, duration_ms |
| `login_failed` | Login rejected | login_method, failure_reason, attempt_number |
| `otp_requested` | Forgot-password OTP sent | otp_type, channel |
| `otp_verified` | OTP accepted | otp_type, channel, attempt_number, duration_ms |

## App usage (mobile)

| Event | Trigger | Properties |
|---|---|---|
| `screen_viewed` | Route change | screen_name, previous_screen |
| `feature_opened` | Feature opened | feature, entry_point |
| `search_performed` | Search executed | search_type, result_count |
| `emergency_contact_updated` | Emergency contact saved/removed from profile | action (set/update/remove) |

## Voice assistant (mobile)

| Event | Trigger | Properties |
|---|---|---|
| `voice_assistant_opened` | Mic overlay opened | entry_point |
| `voice_listening_started` | STT session began | voice_mode |
| `voice_transcript_received` | Final transcript | transcript_length, stt_duration_ms, language |
| `voice_intent_detected` | Parser matched | intent, parser_version, confidence, matched_rule |
| `voice_intent_unrecognized` | Parser returned null | parser_version, transcript_length |
| `voice_command_executed` | Intent handler completed | intent, success, duration_ms |
| `voice_command_failed` | Handler errored | intent, failure_reason, duration_ms |
| `voice_confirmation_requested` | Purchase confirm flow | intent |
| `voice_confirmation_confirmed` | Confirm accepted | intent, confirmation_method |
| `voice_confirmation_cancelled` | Confirm rejected | intent, cancel_reason |
| `voice_response_completed` | TTS reply finished | intent, tts_voice, duration_ms, interrupted |
| `voice_tts_failed` | Speak threw | tts_provider, tts_voice, failure_reason |

## Electricity (mobile)

| Event | Trigger | Properties |
|---|---|---|
| `electricity_purchase_started` | Buy submitted | disco, amount, meter_type, payment_method, entry_point |
| `electricity_purchase_confirmed` | Confirm details | disco, amount, payment_method |
| `electricity_purchase_success` | Vend resolved | disco, amount, payment_method, duration_ms |
| `electricity_purchase_failed` | Vend failed | disco, amount, payment_method, failure_reason, provider, duration_ms |
| `electricity_token_received` | Token delivered | disco, amount, token_delivery_method, duration_ms |

## Airtime (mobile)

| Event | Trigger | Properties |
|---|---|---|
| `airtime_purchase_started` | Buy submitted | network, amount, payment_method, entry_point |
| `airtime_purchase_success` | Vend resolved | network, amount, payment_method, duration_ms |
| `airtime_purchase_failed` | Vend failed | network, amount, payment_method, failure_reason, provider, duration_ms |

## Dues / levies (mobile)

| Event | Trigger | Properties |
|---|---|---|
| `dues_balance_viewed` | Dues screen opened | balance_status |
| `dues_payment_started` | Pay dues tapped | amount, payment_method, payment_type |
| `dues_payment_success` | Payment resolved | amount, payment_method, payment_type, duration_ms |
| `dues_payment_failed` | Payment failed | amount, payment_method, payment_type, failure_reason |

Where `payment_type = monthly_dues | levy`.

## Visitors (mobile)

| Event | Trigger | Properties |
|---|---|---|
| `visitor_created` | Pass issued | visitor_type, pass_duration, entry_method |
| `visitor_updated` | Pass edited | fields_changed |
| `visitor_cancelled` | Pass revoked | reason, time_before_visit |
| `visitor_pass_shared` | Pass shared | share_method |
| `visitor_arrived` | Entry recorded | entry_method |
| `visitor_exited` | Exit recorded | duration_minutes |

## Meetings (mobile)

| Event | Trigger | Properties |
|---|---|---|
| `meeting_viewed` | Meeting detail opened | meeting_type, meeting_status |
| `meeting_report_viewed` | Report viewed | meeting_date |
| `meeting_decisions_viewed` | Decisions viewed | meeting_date, decision_count |
| `meeting_action_items_viewed` | Action items viewed | meeting_date, action_item_count |

## Announcements (mobile)

| Event | Trigger | Properties |
|---|---|---|
| `announcement_viewed` | Announcement opened | announcement_type, announcement_age_days |
| `announcement_read` | Marked read | time_to_read_ms |
| `announcement_attachment_opened` | Attachment opened | attachment_type |

## Notifications (mobile)

| Event | Trigger | Properties |
|---|---|---|
| `push_notification_received` | Push delivered | notification_type, campaign_id |
| `push_notification_opened` | Push tapped | notification_type, campaign_id, time_since_received_ms |
| `notification_permission_granted` | Permission granted | permission_source |

---

## Admin — residents

| Event | Trigger | Properties |
|---|---|---|
| `resident_profile_viewed` | Profile opened | source |
| `resident_created` | User created | registration_method |
| `resident_updated` | User edited | fields_changed |
| `resident_suspended` | User suspended | reason |
| `resident_activated` | User activated | reason |

## Admin — meetings

| Event | Trigger | Properties |
|---|---|---|
| `meeting_created` | Meeting created | meeting_type, scheduled_date |
| `meeting_updated` | Meeting edited | fields_changed |
| `meeting_report_created` | Report submitted | meeting_date, word_count |
| `meeting_decision_added` | Decision added | meeting_date |
| `action_item_created` | Action item added | meeting_date, has_assignee, has_due_date |

## Admin — announcements

| Event | Trigger | Properties |
|---|---|---|
| `announcement_created` | Announcement created | announcement_type, audience, has_attachment |
| `announcement_published` | Announcement published | announcement_type, audience, recipient_count |
| `announcement_deleted` | Announcement deleted | announcement_age_days |

---

## Backend payment events

| Event | Trigger | Properties |
|---|---|---|
| `payment_initiated` | Paystack init | payment_type, amount, provider, payment_method |
| `payment_success` | Verify/webhook resolved | payment_type, amount, provider, duration_ms |
| `payment_failed` | Verify/webhook failed | payment_type, amount, provider, failure_reason, duration_ms |
| `payment_webhook_received` | Webhook received | provider, payment_type, processing_duration_ms |
| `payment_webhook_failed` | Webhook failed | provider, failure_reason, retry_count |

## Backend utility vending

| Event | Trigger | Properties |
|---|---|---|
| `vending_request_created` | Utility purchase row created | utility_type, provider, amount |
| `vending_success` | Provider resolved | utility_type, provider, amount, duration_ms |
| `vending_failed` | Provider rejected | utility_type, provider, amount, failure_reason, duration_ms |
| `vending_timeout` | Provider timed out | utility_type, provider, timeout_ms |

## Reliability

| Event | Trigger | Properties |
|---|---|---|
| `api_request_failed` | API error | endpoint, http_status, error_type, duration_ms |
| `api_timeout` | API timeout | endpoint, timeout_ms |
| `websocket_connected` | WS connected | connection_type, duration_since_app_open_ms |
| `websocket_disconnected` | WS disconnected | disconnect_reason, connection_duration_ms |
| `websocket_reconnected` | WS reconnected | attempt_number, downtime_ms |

---

## Admin dashboard events

| Event | Trigger | Properties |
|---|---|---|
| `admin_login_success` / `admin_login_failed` | Login form | role |
| `admin_logout` | Logout | — |
| `admin_page_viewed` | Route change in shell | page |
| `admin_action` | Any mutating apiFetch (auto) | action (derived from method+path), status |
| `payment_reminders_sent` | Finance button | dues, levies, pledges |
| `csv_exported` | Export button | dataset, row_count |

> Mutating admin calls are tracked centrally inside `apiFetch` — new pages
> get tracking for free without touching each handler.