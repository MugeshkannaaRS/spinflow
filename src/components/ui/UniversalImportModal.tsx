/**
 * @deprecated Removed in the single-mill refactor.
 *
 * The old mapping-based importer (SmartColumnMapper + saved per-mill column
 * mappings + fuzzy match step) has been replaced by `DirectImportModal`,
 * which matches Excel headers to fields directly. This file is intentionally
 * left as a thin re-export so any lingering import path keeps compiling; do
 * not add new usages — import `DirectImportModal` instead.
 */
export { DirectImportModal as UniversalImportModal } from "@/components/ui/DirectImportModal";
