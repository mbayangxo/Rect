# Taali Supabase migrations

Use a **dedicated Taali Supabase project** (not RECT).

Paste each file in Supabase SQL Editor → Run, in order:

1. `20260901_001_foundation.sql`
2. `20260901_002_catalog.sql`
3. `20260901_003_rights.sql`
4. `20260901_004_delivery.sql`
5. `20260901_005_api_audit.sql`

Verify: `npm run probe:taali`
