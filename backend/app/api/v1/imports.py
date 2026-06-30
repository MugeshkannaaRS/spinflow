"""
Imports router — emptied in the single-mill refactor.

The legacy import system (saved per-mill column mappings, SmartColumnMapper
fuzzy matching, and the parse/validate/execute pipeline) has been removed.
SpinFlow now serves a single mill, so bulk imports go directly to each
module's own `/<module>/.../bulk` endpoint with direct header→field matching
on the client (see DirectImportModal.tsx). No column-mapping persistence or
smart-mapping endpoints are needed.

This file is intentionally kept (with an empty router) so existing
`app.include_router(imports_router.router, ...)` wiring in main.py continues
to work without change. Add new import endpoints to the relevant module
router, not here.
"""

from fastapi import APIRouter

router = APIRouter()
