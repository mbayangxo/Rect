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
5. **Listening parties** — done (`/parties` + Home shelf + Artist nav)  
6. **RECT Labels** — done (mutual accept + roster + analytics rollup)  
7. **Analytics** — completion, geo (partial), funnel, compare, label rollup — done  
8. **Upload QC** — LUFS / peak / silence gates — done  
9. **Hearing Aids** — podcasts — done (`/hearing-aids` + artist World section)  
10. **RECT Punch** — done (request → Mark ready → Delivery badge → Taali prefers `punch_audio_url`)  
11. **Behavior learning** — done (plays/likes → affinity → For You / Wave; play progress → completion)  

## Connected loops (end to end)

| Loop | Path |
|------|------|
| Listen | Play → credits → journal → For You (taste + behavior) → Wave |
| Podcast | Upload podcast → Hearing Aids shelf → artist World Hearing Aids |
| Party | Home shelf / `/parties` → host/join/chat |
| DSP | Upload → QC → Punch (optional) → Delivery → Taali → DSPs |
| Money | Tips/packs (JOKO) → wallet · streams → earnings |
| Label | Invite/accept → roster → analytics rollup |

## Ops (you paste in Supabase)

Still need these if not already run (see `docs/SUPABASE_PASTE_LIST.md`):

- `20260904_hearing_aids_and_punch.sql`  
- `20260904_listener_behavior_affinity.sql`  
- Or re-paste updated `_BUNDLE_artist_os.sql`

## Behavior learning

- RPC `listener_behavior_affinity` · merge via `loadListenerTasteWithBehavior`  
- Player → `/api/plays/progress` · inspect `GET /api/account/behavior`

## Upload QC + Punch

- Fail QC → draft + block Publish  
- Punch ready → Delivery shows badge · Taali gets punched master  

## RECT Music vs RECT Artist

- Fans use **RECT Music**.  
- Artists enter **RECT Artist** via `/for-artists`.  
- Labels: invite/accept both sides.  
- Taali is infrastructure, not a RECT account type.

## Out of scope / later (not blockers)

- Label revenue split → wallet automation (split % is stored; invite + accept UX is live)

## Naming lock (do not mix)

- **Wave** = radio  
- **New Wave** = new **radio** shows on Wave (discovery shelf → opens Wave stations)  
- **New Sounds** = music launches  
- Live Room / RECT Live live under **RECT Artist** Presence — not “host New Wave”

## Polish shipped

- Profile **Listening taste** — learned genres / languages / dayparts from plays  
- Label invite by **artist name search** (not UUID-only)
