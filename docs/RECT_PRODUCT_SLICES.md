# RECT product slices (locked naming)

Work **slice by slice, end to end** — no half-wired surfaces.

## Naming (do not mix)

| Name | What it is | Route today |
|------|------------|-------------|
| **Wave** | Live / visual **radio** (shows, stations, now-playing). Same as Radio — not a second product. | `/radio` |
| **New Wave** | **New radio shows** on Wave (stations + live rooms). Not music launches. | `/new-wave` |
| **New Sounds** | Music launch shelf (scheduled track drops). | `/new-sounds` |
| **Hearing Aids** | **Podcasts / talk episodes** (on-demand). Not the social inbox. | `/hearing-aids` |
| **Inbox** | Social notifications (follows, shares, tips…). | `/inbox` (`/hearing-aid` redirects here) |
| **RECT Music** | Fan listening app (plays, wallet via JOKO, Wave, library). | this app (consumer) |
| **RECT Artist** | **Separate site** for artists (upload, World, store, wallet, analytics). Not a drawer item inside RECT Music. Entry: `/for-artists` → `/studio`. | `/studio` |
| **RECT Label** | Mutual accept, roster · `/studio/label` | `/studio/label` |
| **RECT Punch** | Optional mastering after Upload QC; Delivery prefers punched master for Taali. | request on upload / tracks |
| **Taali** | Separate distribution company/API. RECT submits releases; Taali delivers to DSPs. | `taali/` |

## Slice order (status)

1. **Listen loop polish** — done  
2. **Naming + Artist site split** — done  
3. **Decorate my World** — done  
4. **Decorate store** — done  
5. **Listening parties** — done (`/parties`)  
6. **RECT Labels** — done (mutual accept + roster)  
7. **Analytics** — completion, geo (partial), funnel, compare, label rollup — done  
8. **Upload QC** — LUFS / peak / silence gates — done  
9. **Hearing Aids** — podcasts — done (`/hearing-aids`)  
10. **RECT Punch** — request queue + Delivery prefers `punch_audio_url` when ready; partner mastering fills the file later  
11. **Behavior learning** — plays/likes → affinity → For You / Wave; play progress → completion analytics  

## Behavior learning (algorithm + analytics infra)

- RPC `listener_behavior_affinity` rolls up genres / languages / places / dayparts from plays + likes (90-day window).  
- `loadListenerTasteWithBehavior` merges affinity with onboarding taste (declared prefs stay first).  
- Player reports `listened_secs` via `/api/plays/progress` so completion + affinity weights learn real listen length.  
- Studio analytics folds `listening_card_events` into share engagement.  
- Inspect: `GET /api/account/behavior`  
- Paste: `20260904_listener_behavior_affinity.sql` (or re-bundle artist-os).  

## Upload QC + Punch

- Measure on upload: sample rate, LUFS (~−14), true peak ≤ −1 dBTP, silence  
- Fail → draft + block Publish  
- Punch: optional request after QC; Taali ships punched master when `punch_status=ready`  

## RECT Music vs RECT Artist

- Fans use **RECT Music**.  
- Artists enter **RECT Artist** via `/for-artists`.  
- Labels: invite/accept both sides.  
- Taali is infrastructure, not a RECT account type.
