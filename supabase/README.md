# supabase

Supabase configuration for the Data Studio **staging** project.

**This is NOT the production Supabase project.**

The staging project holds:
- Source document metadata (catalogue_sources equivalent)
- Extracted page and chunk records
- AI-suggested staged records (staged_systems, staged_components, etc.)
- Verification state per record
- Manufacturer accounts (Supabase Auth)

## Folders

```
migrations/   Supabase migration SQL files (staging schema only)
seeds/        Seed data for local development and testing
```

## Safety Rule

No migration in this folder should touch the production Supabase project.
Production exports are handled by the `pipelines/publishing/` module, not by migrations.

## Status

Scaffold only. Schema not yet designed.
