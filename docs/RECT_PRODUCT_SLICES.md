# RECT product slices (locked naming)

Work **slice by slice, end to end** — no half-wired surfaces.

## Naming (do not mix)

| Name | What it is | Route today |
|------|------------|-------------|
| **Wave** | Live / visual **radio** (shows, stations, now-playing). Same as Radio — not a second product. | `/radio` |
| **New Wave** | Music launch shelf (scheduled track drops). | `/new-wave` |
| **Hearing Aids** | **Podcasts / talk episodes** (on-demand). Not the social inbox. | TBD under Wave → Hearing Aids |
| **Inbox** | Social notifications (follows, shares, tips…). | `/inbox` |
| **RECT** | Fan + artist platform (plays, wallet via JOKO, Wave, Studio). | this app |
| **Taali** | Separate distribution company/API. RECT submits releases; Taali delivers to DSPs. | `taali/` |

## Slice order

1. **Listen loop polish** — nav, Home shelves, Search chips, Studio 4-tab, listening card, player + lyrics, RECT aesthetic  
2. **Decorate my World** — photos, likeness, portal layout end to end  
3. **Decorate store** — templates + merch products end to end  
4. **Listening parties** — host / join / chat / photos / gifs  
5. **RECT Labels** — mutual accept, roster, splits, label analytics (after World/store)  
6. **Analytics 1–5** — completion, geo, funnel, compare, label rollup  
7. **Upload QC + RECT Punch** — LUFS / peak / silence gates, then Taali gets the master  

## Upload QC (what it means)

Before a track goes live (or to Taali), we **measure the audio file**:

- Sample rate / channels  
- Loudness (LUFS) — aim ~−14 integrated (stream-safe)  
- True peak ≤ −1 dBTP (no clipping on DSP)  
- Silence / junk detection  

**Gate go-live:** warn or block publish if too quiet, clipping, or broken.  
**RECT Punch:** optional mastering preset / partner so RECT has a signature (like Apple’s bass bias) — *after* core listen loop is stable.  
**DSP path:** Taali ships the **mastered** file, not a phone demo.

## RECT vs Spotify for Artists

- Fans use RECT SOUND.  
- Artists sign up as **RECT Artist** → Artist OS (`/studio`).  
- Labels are **RECT Label** (later): invite/accept artists, shared analytics + money splits. Both sides must accept.  
- Taali is infrastructure, not a RECT account type.
