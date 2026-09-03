# Fix your probe — paste these SQL files in order

Your probe shows gaps from **Aug 8 playlists** through **Aug 9 social** plus **Studio earnings**.

## Got `relation "public.users" does not exist`?

Your Supabase project is missing the **core schema**. Run core **first**, then fix-probe:

```bash
npm run db:bundle:core        # → supabase/migrations/_BUNDLE_core.sql
```

Paste `_BUNDLE_core.sql` in SQL Editor → **Run once**, then continue below.

---

## Too much to paste one-by-one?

### Option A — ONE paste (no CLI)

```bash
npm run db:bundle:fix-probe
```

Then in Supabase SQL Editor, open and paste **the entire file**:

`supabase/migrations/_BUNDLE_fix_probe.sql` → **Run once**

(If you have not run core yet, run `_BUNDLE_core.sql` first.)

For Artist OS after that:

```bash
npm run db:bundle:artist-os
```

→ paste `supabase/migrations/_BUNDLE_artist_os.sql`

### Option B — ONE command (needs DB password in `.env.local`)

```bash
# Supabase Dashboard → Settings → Database → Connection string (URI)
# Add to .env.local:
# SUPABASE_DB_URL=postgresql://postgres.[ref]:[PASSWORD]@...

npm run db:apply:fix-probe
npm run db:apply:artist-os
```

Already-applied migrations are **skipped** automatically (`SKIP`).

---

## Manual paste (if you prefer)

Open each file under `supabase/migrations/`, copy all SQL, paste in **Supabase SQL Editor → Run**, one file at a time, **in this order**.

Do **not** paste `scripts/apply-supabase-sql.mjs` (JavaScript).

---

## Block A — Aug 8 (playlists & profiles)

1. `20260808_users_avatar.sql`
2. `20260808_users_select_public_profiles.sql`
3. `20260808_playlist_public.sql`
4. `20260808_playlist_description.sql`
5. `20260808_playlist_cover.sql`
6. `20260808_playlist_pinned.sql`
7. `20260808_plays_shared_activity.sql`
8. `20260808_plays_delete_own.sql`
9. `20260808_tracks_delete_own.sql`
10. `20260808_like_notifications.sql`
11. `20260808_release_notify_dedupe.sql`

---

## Block B — Aug 9 social (order matters — do not skip or reorder)

12. `20260809_people_follows.sql`
13. `20260809_user_blocks.sql`
14. `20260809_block_drops_playlist_follows.sql`
15. `20260809_block_drops_artist_follows.sql`
16. `20260809_playlist_follows.sql`
17. `20260809_playlist_collaborators.sql`
18. `20260809_collab_asks_durable.sql`
19. `20260809_playlist_comments.sql`
20. `20260809_playlist_comment_replies_likes.sql`
21. `20260809_track_comments.sql`
22. `20260809_comment_replies.sql`
23. `20260809_comment_likes.sql`
24. `20260809_tracks_duration_secs.sql`
25. `20260809_tracks_language.sql`
26. `20260809_playlist_collab_track_adds.sql`
27. `20260809_public_liked_tracks.sql`
28. `20260809_privacy_saves_followed_artists.sql`
29. `20260809_privacy_show_followers.sql`
30. `20260809_listen_notifications.sql`
31. `20260809_play_activity_thanks.sql`
32. `20260809_like_activity_thanks.sql`
33. `20260809_mix_activity_thanks.sql`
34. `20260809_comment_thanks.sql`
35. `20260809_playlist_comment_thanks.sql`
36. `20260809_tip_message_track.sql`
37. `20260809_tip_thanks.sql` ← fixes `send_tip_thanks`
38. `20260809_tip_thanks_track.sql`
39. `20260809_tip_inbox_thanks.sql`
40. `20260809_share_thanks.sql`
41. `20260809_playlist_follow_thanks.sql`
42. `20260809_people_follow_thanks.sql`
43. `20260809_artist_follow_thanks.sql` ← fixes `send_follow_thanks`
44. `20260809_comment_like_thanks.sql`
45. `20260809_comment_reply_thanks.sql`
46. `20260809_people_follow_notify.sql`
47. `20260809_send_to_friend.sql`
48. `20260809_friend_mix_published.sql`
49. `20260809_playlist_copy_notify.sql`
50. `20260809_playlist_copy_thanks.sql`
51. **`20260809_playlist_copy_related.sql`** ← inbox copy links + `related_playlist_id`
52. `20260809_playlist_savers_roster.sql`
53. `20260809_friends_who_saved_playlist.sql`
54. `20260809_person_saved_playlists.sql`
55. `20260809_person_followed_artists.sql`
56. `20260809_playlist_saver_track_notify.sql`
57. `20260809_playlist_collab_request.sql`
58. `20260809_collab_approve_from_request.sql`
59. `20260809_collab_invite_from_request.sql`
60. `20260809_playlist_collab_exit_notify.sql`
61. `20260809_track_likes_artist_select.sql`
62. `20260809_artist_listen_thanks.sql`
63. `20260809_artist_like_thanks.sql`

---

## Block C — Studio & earnings (fixes writer splits + play credits)

64. `20260810_phase1_track_live_status.sql` *(if not already run)*
65. `20260810_track_writer_splits.sql`
66. `20260811_record_credited_play.sql`
67. **`20260830_artist_play_earnings_bootstrap.sql`**

---

## Block D — Optional columns from your probe

68. `20260830_tracks_taali_fields.sql` — `isrc_code`, `writer_splits`, `taali_registry_id`  
   *(or skip if you already ran `20260831_artist_os_delivery_suite.sql`, which adds `isrc_code` / `upc_code` / `launch_at`)*
69. `20260830_users_artist_banner.sql` — `artist_banner_url`

---

## After paste

1. Re-run `supabase/migrations/_probe_missing_aug08_09.sql` — all rows should be **ok**.
2. Then run **Artist OS batch** if not done:
   - `20260831_artist_os_delivery_suite.sql`
   - `20260831_joko_tips.sql`

---

## CLI alternative (if `SUPABASE_DB_URL` is in `.env.local`)

Paste is still safest for long runs. For automation:

```bash
# Apply aug 8–9 one file at a time
npm run db:apply -- 20260808_users_avatar.sql
# … etc
```

There is no single “apply all aug 9” flag yet — paste Block B in order, or run `db:apply` per filename.

---

## If a file errors

- **“relation X does not exist”** — you skipped an earlier file in this list; go back.
- **“already exists”** — safe to skip that file and continue.
- **tip_thanks fails** — ensure `20260807_artist_tips.sql` ran earlier (core #18).
