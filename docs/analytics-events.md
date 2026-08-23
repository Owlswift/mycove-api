# CommunityHub Analytics Event Dictionary

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
`estate_id`, `estate_name`, `role`, `platform`; identity reset on logout.

**Privacy guardrails (enforced in wrappers):**
- Voice transcripts truncated to 120 chars; digit-runs ≥ 7 chars (meter/phone numbers) redacted
- Never sent as properties: passwords, PINs, tokens, full phone numbers, meter numbers

---

## Lifecycle (mobile)

| Event | Trigger | Properties |
|---|---|---|
| `app_opened` | App cold start | platform |
| `app_foregrounded` / `app_backgrounded` | Lifecycle change | — |

## Auth & onboarding (mobile)

| Event | Trigger | Properties |
|---|---|---|
| `estate_code_submitted` | Estate code lookup attempted | success, error |
| `estate_confirmed` | "Continue to Login" on estate-found screen | estate_id, estate_name |
| `login_started` | Login submit tapped | role |
| `login_success` | Login succeeded | role |
| `login_failed` | Login rejected | role, error |
| `otp_requested` | Forgot-password OTP sent | success |
| `otp_verified` | OTP accepted | success |
| `password_reset_completed` | New password saved | — |
| `force_reset_completed` | First-login setup finished | role |
| `logout` | Logout tapped | — |
| `biometric_enabled` / `biometric_disabled` | Profile toggle | success |
| `app_unlocked` | Lock screen passed | method (biometric/pin), success |

## Dues & levies (mobile)

| Event | Trigger | Properties |
|---|---|---|
| `dues_payment_started` | Pay dues tapped | amount |
| `dues_payment_success` / `dues_payment_failed` | Verify loop resolved | amount, reference |
| `levy_payment_success` | Levy paid | levy_label, amount |

## Electricity & airtime (mobile)

| Event | Trigger | Properties |
|---|---|---|
| `electricity_flow_started` | Wizard opened | entry_point (manual/voice) |
| `meter_verified` | DISCO verification returned | disco_code, meter_type, success |
| `meter_added` | Meter saved to account | disco_code |
| `electricity_purchase_started` | Buy submitted | amount, disco_code |
| `electricity_purchase_success` / `_failed` | Vend resolved | amount, disco_code, failure_reason |
| `airtime_purchase_started` | Buy submitted | amount, network |
| `airtime_purchase_success` / `_failed` | Vend resolved | amount, network, failure_reason |

## Voice assistant (mobile)

| Event | Trigger | Properties |
|---|---|---|
| `voice_assistant_opened` | Mic overlay opened | — |
| `voice_listening_started` | STT session began | awaiting_meter_number |
| `voice_transcript_received` | Final transcript | transcript (redacted/truncated) |
| `voice_intent_detected` | Parser matched | intent, matched_rule, params, latency_ms |
| `voice_intent_unrecognized` | Parser returned null | transcript (redacted) |
| `voice_command_executed` | Intent handler completed | intent, navigation_target |
| `voice_command_failed` | Handler errored | intent, failure_reason |
| `voice_confirmation_requested` / `_confirmed` / `_cancelled` | Purchase confirm flow | kind, amount |
| `voice_tts_failed` | Speak threw | — |

## Visitors & gate (mobile)

| Event | Trigger | Properties |
|---|---|---|
| `visitor_created` | Pass issued | valid_hours |
| `visitor_cancelled` | Pass revoked | — |
| `gate_access_granted` / `gate_access_denied` | Guard verify result | reason |
| `entry_recorded` / `exit_recorded` | Guard logged movement | — |

## Meetings & engagement (mobile)

| Event | Trigger | Properties |
|---|---|---|
| `meeting_report_played` / `_paused` / `_stopped` | Report TTS controls | meeting_id, report_length |
| `meeting_added_to_calendar` | Calendar button | meeting_id |
| `poll_voted` | Vote cast | poll_id |
| `complaint_submitted` | Complaint filed | category, ref |
| `pledge_made` | Pledge committed | project_id, amount |
| `announcement_read` | Announcement opened | announcement_id, category |
| `notification_opened` | Push tap → refresh | type |

---

## Backend business events (server-side = authoritative)

| Event | Trigger | Properties |
|---|---|---|
| `payment_initiated` | Paystack init | purpose, amount, user_id, estate_id |
| `payment_success` / `payment_failed` | Verify/webhook resolved | purpose, amount, reference |
| `vending_request_created` | Utility purchase row created | type, amount, request_id |
| `vending_provider_called` | VTpass/BuyPower call | provider, type, attempt |
| `vending_success` / `vending_failed` / `vending_timeout` | Provider resolved | provider, type, amount, duration_ms, failure_reason |
| `token_generated` | Electricity token issued | disco_code, units |
| `wallet_transaction` | Ledger entry written | type, amount, balance_after |
| `account_created` / `account_revoked` | User lifecycle | role, estate_id |
| `meeting_reminders_sent` | Scheduler fired kinds for a meeting | kinds |
| `payment_reminder_cron_ran` | Daily sweep per estate | dues, levies, pledges counts |
| `payment_reminders_sent_manual` | Admin button sweep | same counts |
| `notification_failed` | FCM multicast partial failure | failure_count |

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