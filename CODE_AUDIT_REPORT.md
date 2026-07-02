# SpinFlow — Code Audit & Cleanup Report

**Date:** 2026-07-02
**Branch:** `cleanup/audit-dead-code` (1 commit, `f5528c0`)
**Scope:** Whole repo — dead/unused code + debug leftovers, verified before/after.
**Net change:** 129 files, −162 lines (207 insertions / 369 deletions).

## What was changed (safe, verified)

| Fix | Count | Notes |
|-----|-------|-------|
| Unused imports removed (F401) | 417 | Across `app/`, `scripts/`, `tests/`. |
| Redefined-unused imports removed (F811) | 12 | Duplicate imports. |
| Empty f-strings fixed (F541) | 19 | `f"..."` with no placeholders → plain string. |
| Unused exception bindings removed (F841, safe) | ~5 | `except X as e:` where `e` unused. |
| **Latent missing-import bugs fixed** | **7** | See below — real `NameError`s waiting to fire. |

### The 7 real bugs fixed
Names used at runtime but never imported (would raise `NameError` when that code path executes — not caught at import time, which is why they shipped):

- `dispatch.py` — `datetime`, `timezone` (dispatch creation)
- `admin.py` — `text` (system-health billing query)
- `purchase.py` — `HTTPException` (cancel/supplier 404/400 paths)
- `stock.py` — `select` (mill scope check)
- `reports.py` — `logging` + `logger` (exception logging)
- `exports.py` — `Optional` (type annotation)
- `users.py` — `log_audit` (audit trail on user actions)

## What was deliberately NOT auto-changed

**114 unused imports in `__init__.py`** — these are public-API re-exports (`from app.models import X`). Removing them silently breaks imports elsewhere, so they were kept by convention.

**63 unused local variables (F841)** — these are *not* dead lines. The variable is unused but the right-hand side is a required call with side effects — DB writes (`await db.execute("UPDATE ...")`), test fixtures (`sub = await _create_subscription(...)`), service construction. Deleting them would break data operations and tests. Recommendation: drop only the binding (keep the call) case-by-case; low priority.

**2 remaining real bugs — need a developer decision (could not safely guess):**
- `ui_config.py:406` and `:475` call `_default_config(table, "default")`, but **`_default_config` is not defined anywhere in the codebase.** This will `NameError` when hit. Someone deleted/renamed the helper. Needs the intended function restored.

**46 F821 "undefined name" in test files** — false positives. They are quoted forward-reference type hints (`param: "User"`), never evaluated at runtime. Harmless; optionally add `from app.models.user import User` under `TYPE_CHECKING` for cleanliness.

## Debug leftovers

- **Backend `app/`:** no debug cruft. The 10 `print()` calls are legitimate (CLI seed output, a config help string, a startup message). The ~298 prints in `scripts/`/`seed_*` are intentional CLI tooling — left alone.
- **Frontend `src/`:** clean. The only 2 `console.*` calls are intentional `console.warn` error handling (auth rehydration, api base-URL warning). No files changed.
- No `breakpoint()`/`pdb` anywhere.

## Time complexity

No algorithmic hotspots were rewritten in this pass — the audit was scoped to dead code + leftovers, and the changes are semantics-preserving. A separate performance pass (N+1 query detection, nested-loop review) can be done next if you want; that carries more risk and should be its own reviewed change.

## Verification (all passed post-change)

- `py_compile` on every tracked `.py` — OK
- `import app.main` — OK
- Imported all **155** app modules individually (catches broken re-exports) — 0 failures
- Full test suite **collects: 377 tests**, 0 collection errors
- Frontend `src/` untouched (0 files changed)

> Note: full backend `pytest` run and frontend `vitest` require a live Postgres DB / matching native binaries not available in this sandbox, so collection + import + compile were used as the safety net. Run `pytest` and `bun test` locally before merging.

## Merge

```
git checkout main
git merge cleanup/audit-dead-code
# then locally: pytest (backend) and bun run test (frontend)
```
