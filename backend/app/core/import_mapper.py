"""
Deprecated — removed in the single-mill refactor.

The SmartColumnMapper (alias + fuzzy Levenshtein header→field matching) backed
the old import pipeline. SpinFlow now serves a single mill and imports match
columns directly on the client (DirectImportModal.tsx), so no server-side
fuzzy mapper is required. This module is intentionally left empty; nothing
imports it anymore. Do not reintroduce — add direct bulk endpoints instead.

NOTE: `app.core.field_aliases` is still in use by mill_master_sync and the
masters router, so it was kept. Only this mapper was retired.
"""
