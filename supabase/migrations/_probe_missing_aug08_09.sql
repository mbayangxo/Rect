-- ============================================================
-- RECT SOUND — migration probe
-- Paste in Supabase SQL Editor → Run
-- Returns one row per expected object; status = ok | MISSING
-- If anything is MISSING, run the matching file under supabase/migrations/
-- ============================================================

with expected(kind, name, migration) as (
  values
    -- Aug 8
    ('column', 'users.avatar_url', '20260808_users_avatar.sql'),
    ('column', 'playlists.is_public', '20260808_playlist_public.sql'),
    ('column', 'playlists.description', '20260808_playlist_description.sql'),
    ('column', 'playlists.cover_art_url', '20260808_playlist_cover.sql'),
    ('column', 'playlists.pinned_at', '20260808_playlist_pinned.sql'),
    ('policy', 'plays_select_shared_activity', '20260808_plays_shared_activity.sql'),

    -- Aug 9 core social
    ('table', 'people_follows', '20260809_people_follows.sql'),
    ('table', 'user_blocks', '20260809_user_blocks.sql'),
    ('function', 'toggle_user_block', '20260809_block_drops_playlist_follows.sql'),
    ('table', 'playlist_follows', '20260809_playlist_follows.sql'),
    ('table', 'playlist_collaborators', '20260809_playlist_collaborators.sql'),
    ('table', 'playlist_collab_asks', '20260809_collab_asks_durable.sql'),
    ('table', 'playlist_comments', '20260809_playlist_comments.sql'),
    ('table', 'playlist_comment_likes', '20260809_playlist_comment_replies_likes.sql'),
    ('table', 'track_comments', '20260809_track_comments.sql'),
    ('table', 'comment_likes', '20260809_comment_likes.sql'),
    ('table', 'play_thanks', '20260809_play_activity_thanks.sql'),
    ('table', 'like_thanks', '20260809_like_activity_thanks.sql'),
    ('table', 'mix_thanks', '20260809_mix_activity_thanks.sql'),
    ('table', 'comment_thanks', '20260809_comment_thanks.sql'),
    ('table', 'playlist_comment_thanks', '20260809_playlist_comment_thanks.sql'),

    -- Aug 9 columns
    ('column', 'tracks.duration_secs', '20260809_tracks_duration_secs.sql'),
    ('column', 'tracks.language', '20260809_tracks_language.sql'),
    ('column', 'playlist_tracks.added_by', '20260809_playlist_collab_track_adds.sql'),
    ('column', 'playlist_comments.parent_id', '20260809_playlist_comment_replies_likes.sql'),
    ('column', 'track_comments.parent_id', '20260809_comment_replies.sql'),
    ('column', 'users.privacy_show_likes', '20260809_public_liked_tracks.sql'),
    ('column', 'users.privacy_show_saves', '20260809_privacy_saves_followed_artists.sql'),
    ('column', 'users.privacy_show_followed_artists', '20260809_privacy_saves_followed_artists.sql'),
    ('column', 'users.privacy_show_followers', '20260809_privacy_show_followers.sql'),
    ('column', 'artist_notifications.play_id', '20260809_artist_listen_thanks.sql'),

    -- Aug 9 RPCs (feature gates)
    ('function', 'toggle_people_follow', '20260809_people_follows.sql'),
    ('function', 'toggle_playlist_follow', '20260809_block_drops_playlist_follows.sql'),
    ('function', 'playlist_save_count', '20260809_playlist_savers_roster.sql'),
    ('function', 'friends_who_saved_playlist', '20260809_friends_who_saved_playlist.sql'),
    ('function', 'person_saved_public_playlists', '20260809_person_saved_playlists.sql'),
    ('function', 'person_followed_artists', '20260809_person_followed_artists.sql'),
    ('function', 'person_people_followers', '20260809_privacy_show_followers.sql'),
    ('function', 'person_people_following', '20260809_privacy_show_followers.sql'),
    ('function', 'person_people_follow_counts', '20260809_privacy_show_followers.sql'),
    ('function', 'notify_track_listen', '20260809_listen_notifications.sql'),
    ('function', 'send_play_thanks', '20260809_play_activity_thanks.sql'),
    ('function', 'send_like_thanks', '20260809_like_activity_thanks.sql'),
    ('function', 'send_mix_thanks', '20260809_mix_activity_thanks.sql'),
    ('function', 'send_comment_thanks', '20260809_comment_thanks.sql'),
    ('function', 'send_playlist_comment_thanks', '20260809_playlist_comment_thanks.sql'),
    ('function', 'send_share_thanks', '20260809_share_thanks.sql'),
    ('function', 'send_playlist_follow_thanks', '20260809_playlist_follow_thanks.sql'),
    ('function', 'send_playlist_copy_thanks', '20260809_playlist_copy_thanks.sql'),
    ('function', 'send_people_follow_thanks', '20260809_people_follow_thanks.sql'),
    ('function', 'send_follow_thanks', '20260809_artist_follow_thanks.sql'),
    ('function', 'send_comment_like_thanks', '20260809_comment_like_thanks.sql'),
    ('function', 'send_tip_thanks', '20260809_tip_thanks.sql'),
    ('function', 'notify_comment_reply', '20260809_comment_reply_thanks.sql'),
    ('function', 'notify_playlist_comment_reply', '20260809_comment_reply_thanks.sql'),
    ('function', 'notify_people_follow', '20260809_people_follow_notify.sql'),
    ('function', 'notify_track_share', '20260809_send_to_friend.sql'),
    ('function', 'notify_playlist_share', '20260809_send_to_friend.sql'),
    ('function', 'notify_friend_mix_published', '20260809_friend_mix_published.sql'),
    ('function', 'notify_playlist_copy', '20260809_playlist_copy_related.sql'),
    ('column', 'artist_notifications.related_playlist_id', '20260809_playlist_copy_related.sql'),
    ('function', 'notify_playlist_follow', '20260809_block_drops_playlist_follows.sql'),
    ('function', 'notify_playlist_followers_track_add', '20260809_block_drops_playlist_follows.sql'),
    ('function', 'toggle_comment_like', '20260809_comment_likes.sql'),

    -- Aug 10 Artist Studio
    ('table', 'track_writer_splits', '20260810_track_writer_splits.sql'),
    ('function', 'set_track_writer_splits', '20260810_track_writer_splits.sql'),
    ('function', 'toggle_playlist_comment_like', '20260809_playlist_comment_replies_likes.sql'),
    ('function', 'invite_playlist_collaborator', '20260809_playlist_collaborators.sql'),
    ('function', 'approve_playlist_collab_request', '20260809_collab_approve_from_request.sql'),
    ('function', 'decline_playlist_collab_request', '20260809_collab_approve_from_request.sql'),
    ('function', 'has_playlist_collab_ask_pending', '20260809_collab_asks_durable.sql'),
    ('function', 'cancel_playlist_collab_ask', '20260809_collab_asks_durable.sql'),
    ('function', 'list_playlist_collab_asks', '20260809_collab_asks_durable.sql'),
    ('policy', 'track_likes_select_as_artist', '20260809_track_likes_artist_select.sql'),
    ('function', 'notify_track_comment', '20260809_track_comments.sql'),
    ('function', 'notify_playlist_comment', '20260809_playlist_comments.sql')
),
checked as (
  select
    e.migration,
    e.kind,
    e.name,
    case e.kind
      when 'table' then (
        to_regclass('public.' || e.name) is not null
      )
      when 'function' then (
        exists (
          select 1
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname = e.name
        )
      )
      when 'column' then (
        exists (
          select 1
          from information_schema.columns c
          where c.table_schema = 'public'
            and c.table_name = split_part(e.name, '.', 1)
            and c.column_name = split_part(e.name, '.', 2)
        )
      )
      when 'policy' then (
        exists (
          select 1
          from pg_policies p
          where p.schemaname = 'public'
            and p.policyname = e.name
        )
      )
      else false
    end as present
  from expected e
)
select
  case when present then 'ok' else 'MISSING' end as status,
  migration,
  kind,
  name
from checked
order by present asc, migration, kind, name;
