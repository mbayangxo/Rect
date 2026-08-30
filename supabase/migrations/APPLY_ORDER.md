# Supabase migration apply order

Paste each file into the **Supabase SQL Editor → Run**, in this order.
After applying, run `_probe_missing_aug08_09.sql` — every row should show `ok`.

## Core (run first if starting fresh)

1. `20260806_onboarding_users.sql`
2. `20260806_fix_auth_trigger.sql`
3. `20260806_storage_tracks_bucket.sql`
4. `20260806_plays_artist_policies.sql`
5. `20260807_users_role_fan_artist.sql`
6. `20260807_users_phone_number_default.sql`
7. `20260807_fix_phone_unique_and_taste.sql`
8. `20260807_cultural_onboarding.sql`
9. `20260807_play_packs.sql`
10. `20260807_play_credits.sql`
11. `20260807_dashboard_discovery.sql`
12. `20260807_chart_privacy.sql`
13. `20260807_user_privacy_settings.sql`
14. `20260807_track_likes.sql`
15. `20260807_track_like_counts.sql`
16. `20260807_artist_follows.sql`
17. `20260807_artist_notifications.sql`
18. `20260807_artist_tips.sql`
19. `20260807_playlists.sql`
20. `20260807_track_publish_gate.sql`
21. `20260807_release_notifications.sql`

## Aug 8 — playlists & profiles

22. `20260808_users_avatar.sql`
23. `20260808_users_select_public_profiles.sql`
24. `20260808_playlist_public.sql`
25. `20260808_playlist_description.sql`
26. `20260808_playlist_cover.sql`
27. `20260808_playlist_pinned.sql`
28. `20260808_plays_shared_activity.sql`
29. `20260808_plays_delete_own.sql`
30. `20260808_tracks_delete_own.sql`
31. `20260808_like_notifications.sql`
32. `20260808_release_notify_dedupe.sql`

## Aug 9 — social (order matters within this block)

33. `20260809_people_follows.sql`
34. `20260809_user_blocks.sql`
35. `20260809_block_drops_playlist_follows.sql`
36. `20260809_block_drops_artist_follows.sql`
37. `20260809_playlist_follows.sql`
38. `20260809_playlist_collaborators.sql`
39. `20260809_collab_asks_durable.sql`
40. `20260809_playlist_comments.sql`
41. `20260809_playlist_comment_replies_likes.sql`
42. `20260809_track_comments.sql`
43. `20260809_comment_replies.sql`
44. `20260809_comment_likes.sql`
45. `20260809_tracks_duration_secs.sql`
46. `20260809_tracks_language.sql`
47. `20260809_playlist_collab_track_adds.sql`
48. `20260809_public_liked_tracks.sql`
49. `20260809_privacy_saves_followed_artists.sql`
50. `20260809_privacy_show_followers.sql`
51. `20260809_listen_notifications.sql`
52. `20260809_play_activity_thanks.sql`
53. `20260809_like_activity_thanks.sql`
54. `20260809_mix_activity_thanks.sql`
55. `20260809_comment_thanks.sql`
56. `20260809_playlist_comment_thanks.sql`
57. `20260809_tip_message_track.sql`
58. `20260809_tip_thanks.sql`
59. `20260809_tip_thanks_track.sql`
60. `20260809_tip_inbox_thanks.sql`
61. `20260809_share_thanks.sql`
62. `20260809_playlist_follow_thanks.sql`
63. `20260809_people_follow_thanks.sql`
64. `20260809_artist_follow_thanks.sql`
65. `20260809_comment_like_thanks.sql`
66. `20260809_comment_reply_thanks.sql`
67. `20260809_people_follow_notify.sql`
68. `20260809_send_to_friend.sql`
69. `20260809_friend_mix_published.sql`
70. `20260809_playlist_copy_notify.sql`
71. `20260809_playlist_copy_thanks.sql`
72. **`20260809_playlist_copy_related.sql`** ← **required for copy inbox links**
73. `20260809_playlist_savers_roster.sql`
74. `20260809_friends_who_saved_playlist.sql`
75. `20260809_person_saved_playlists.sql`
76. `20260809_person_followed_artists.sql`
77. `20260809_playlist_saver_track_notify.sql`
78. `20260809_playlist_collab_request.sql`
79. `20260809_collab_approve_from_request.sql`
80. `20260809_collab_invite_from_request.sql`
81. `20260809_playlist_collab_exit_notify.sql`
82. `20260809_playlist_copy_notify.sql` (skip if already run)
83. `20260809_track_likes_artist_select.sql`
84. `20260809_artist_listen_thanks.sql`
85. `20260809_artist_like_thanks.sql`

## Aug 10–11 — Studio & plays

86. `20260810_phase1_track_live_status.sql`
87. `20260810_track_writer_splits.sql`
88. `20260811_record_credited_play.sql`
90. `20260811_artist_play_earnings.sql`
91. `20260811_play_pack_purchase_pending.sql`
92. `20260830_fix_play_earnings_play_id.sql` ← **fix if play earnings fail**
93. `20260830_tracks_taali_fields.sql` ← optional nullable TAALI columns on tracks
94. `20260830_users_artist_banner.sql` ← artist portal banner (optional)
95. `20260830_tracks_editorial_boost.sql` ← RECT SCORE editorial component (optional)
96. `20260830_joko_play_pack_payment.sql` ← JOKO mobile money on play packs (optional)
97. `20260830_artist_merch_store.sql` ← Artist merch store + JOKO purchases

## Verify

Run `_probe_missing_aug08_09.sql`. Fix any `MISSING` row using the file named in that row.

### playlist_copy_related (common gap)

If probe shows `MISSING` for:

- `notify_playlist_copy` → run **`20260809_playlist_copy_related.sql`**
- `artist_notifications.related_playlist_id` → same file

Must run **after** `20260809_playlist_copy_notify.sql` and `20260809_playlist_copy_thanks.sql`.
