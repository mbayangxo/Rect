# RECT product slices (locked naming)

Work **slice by slice, end to end** — no half-wired surfaces.

## Naming (do not mix)

| Name | What it is | Route today |
|------|------------|-------------|
| **Wave** | Live / visual **radio** (shows, stations, now-playing). Same as Radio — not a second product. | `/radio` |
| **New Wave** | **New radio shows** on Wave (stations + live rooms). Not music launches. | `/new-wave` |
| **New Sounds** | Music launch shelf (scheduled track drops). | `/new-sounds` |
| **Hearing Aids** | **Podcasts / talk episodes** (on-demand). Not the social inbox. | TBD under Wave → Hearing Aids |
| **Inbox** | Social notifications (follows, shares, tips…). | `/inbox` |
| **RECT Music** | Fan listening app (plays, wallet via JOKO, Wave, library). | this app (consumer) |
| **RECT Artist** | **Separate site** for artists (upload, World, store, wallet, analytics). Not a drawer item inside RECT Music. Entry: `/for-artists` → `/studio`. | `/studio` |
| **RECT Label** | Future: mutual accept with artists, roster, splits. | TBD |
| **Taali** | Separate distribution company/API. RECT submits releases; Taali delivers to DSPs. | `taali/` |

## Slice order

1. **Listen loop polish** — nav, Home shelves, Search chips, listening card, player + lyrics, RECT aesthetic  
2. **Naming + Artist site split** — New Sounds / New Wave / RECT Artist separate from Music  
3. **Decorate my World** — photos, likeness, portal layout end to end  
4. **Decorate store** — templates + merch products end to end  
5. **Listening parties** — host / join / chat / gifs · `/parties`  
6. **RECT Labels** — mutual accept, roster · `/studio/label` (splits analytics later)  
7. **Analytics 1–5** — completion (live), geo (partial), funnel/compare/label rollup next  
8. **Upload QC + RECT Punch** — LUFS / peak / silence gates live on upload + publish; RECT Punch mastering preset later  

## Upload QC (what it means)

Before a track goes live (or to Taali), we **measure the audio file**:

- Sample rate / channels  
- Loudness (LUFS) — aim ~−14 integrated (stream-safe)  
- True peak ≤ −1 dBTP (no clipping on DSP)  
- Silence / junk detection  

**Gate go-live:** warn or block publish if too quiet, clipping, or broken.  
**RECT Punch:** optional mastering preset / partner so RECT has a signature (like Apple’s bass bias) — *after* core listen loop is stable.  
**DSP path:** Taali ships the **mastered** file, not a phone demo.

## RECT Music vs RECT Artist

- Fans use **RECT Music**.  
- Artists enter **RECT Artist** via `/for-artists` (not nested as a casual Music feature).  
- Labels are **RECT Label** (later): invite/accept artists, shared analytics + money splits. Both sides must accept.  
- Taali is infrastructure, not a RECT account type.
