# Alkebulan / Kebu

Kebu is the site builder. Sites built with Kebu live here. This is **not** Rect Sound.

| Site | Path | What it is |
| --- | --- | --- |
| K-Direction | `alkebulan/k-direction` | First Kebu site. Label website, portal, careers, Joko tickets. |

## This Cursor chat is still Rect

Cursor Cloud Agents are tied to **one GitHub repo**. This agent is `github.com/mbayangxo/rect`. It cannot jump to a different Cursor project.

There is no Kebu GitHub repo yet. Your repos today:

- [Rect](https://github.com/mbayangxo/Rect) — this chat
- [Keit](https://github.com/mbayangxo/Keit) — payments app (not Kebu)
- [Fekk](https://github.com/mbayangxo/Fekk)
- [Bloombay](https://github.com/mbayangxo/Bloombay)

## Put K-Direction under Kebu in Cursor

1. Create a new GitHub repo named **Kebu** (for example `github.com/mbayangxo/Kebu`).
2. Copy this folder into that repo as the repo root, or keep `k-direction/` inside it.
3. In Cursor, **open that Kebu repo** (File → Open, or a new Cloud Agent on the Kebu repo). Do not keep working in this Rect agent.
4. On Vercel, connect the **Kebu** repo. Root Directory: `k-direction` if the app stays in that subfolder, or `.` if it is the repo root.

Until those four steps happen, the code can only live in this Rect pull request: https://github.com/mbayangxo/rect/pull/3

Deploy each Kebu site as its own Vercel project. Do not use Rect Sound’s root `vercel.json`.
