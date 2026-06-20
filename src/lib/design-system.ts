/**
 * MillFlow ERP — Design System Constants v1
 *
 * Single source of truth for button labels, icons, and component variants.
 * All route and component code should import from here instead of hardcoding.
 */

// ── Button Labels ──────────────────────────────────────────────────────────
export const BUTTON_LABELS = {
  // Export
  EXPORT_EXCEL: "Export Excel",
  EXPORT_CSV: "Export CSV",
  EXPORT_PDF: "Export PDF",
  EXPORT: "Export",

  // Import
  IMPORT: "Import",
  IMPORT_EXCEL: "Import Excel",

  // Template
  DOWNLOAD_TEMPLATE: "Download Template",

  // CRUD
  ADD: "Add",
  CREATE: "Create",
  SAVE: "Save",
  SAVE_CHANGES: "Save Changes",
  UPDATE: "Update",
  DELETE: "Delete",
  DEACTIVATE: "Deactivate",
  CANCEL: "Cancel",

  // Actions
  APPROVE: "Approve",
  REJECT: "Reject",
  SUBMIT: "Submit",
  GENERATE: "Generate",
  PRINT: "Print",
  PROCESS: "Process",
  FINALIZE: "Finalize",
  MARK_PAID: "Mark Paid",

  // Navigation
  BACK: "Back",
  CLOSE: "Close",
  DONE: "Done",
  NEXT: "Next",
  PREVIOUS: "Previous",

  // Status
  ACTIVATE: "Activate",
  SUSPEND: "Suspend",
  RESTORE: "Restore",
  REACTIVATE: "Reactivate",
  ARCHIVE: "Archive",
} as const;

// ── Icon Names (lucide-react) ──────────────────────────────────────────────
export const BUTTON_ICONS = {
  EXPORT: "ArrowUpFromLine",
  IMPORT: "ArrowDown",
  DOWNLOAD: "Download",
  UPLOAD: "Upload",
  ADD: "Plus",
  DELETE: "Trash2",
  DEACTIVATE: "PowerOff",
  EDIT: "Pencil",
  VIEW: "Eye",
  SEARCH: "Search",
  FILTER: "Filter",
  APPROVE: "Check",
  REJECT: "X",
  SAVE: "Save",
  CANCEL: "X",
  BACK: "ChevronLeft",
  NEXT: "ChevronRight",
  REFRESH: "RefreshCw",
  SETTINGS: "Settings",
  USER: "User",
  COMPANY: "Building2",
  MILL: "Factory",
  DATE: "Calendar",
  DOWNLOAD_CLOUD: "CloudDownload",
  UPLOAD_CLOUD: "CloudUpload",
  MORE: "MoreHorizontal",
  MENU: "Menu",
  CLOSE: "X",
} as const;

// ── Button Variants ────────────────────────────────────────────────────────
export const BUTTON_VARIANTS = {
  PRIMARY: "default" as const,
  SECONDARY: "secondary" as const,
  OUTLINE: "outline" as const,
  GHOST: "ghost" as const,
  DESTRUCTIVE: "destructive" as const,
  LINK: "link" as const,
};

// ── Button Sizes ───────────────────────────────────────────────────────────
export const BUTTON_SIZES = {
  SM: "sm" as const,
  DEFAULT: "default" as const,
  LG: "lg" as const,
  ICON: "icon" as const,
};

// ── Action Button Presets ──────────────────────────────────────────────────
export const ACTION_BUTTONS = {
  ADD: {
    label: BUTTON_LABELS.ADD,
    icon: BUTTON_ICONS.ADD as string,
    variant: BUTTON_VARIANTS.PRIMARY,
    size: BUTTON_SIZES.SM,
  },
  DELETE: {
    label: BUTTON_LABELS.DELETE,
    icon: BUTTON_ICONS.DELETE as string,
    variant: BUTTON_VARIANTS.DESTRUCTIVE,
    size: BUTTON_SIZES.SM,
  },
  DEACTIVATE: {
    label: BUTTON_LABELS.DEACTIVATE,
    icon: BUTTON_ICONS.DEACTIVATE as string,
    variant: BUTTON_VARIANTS.OUTLINE,
    size: BUTTON_SIZES.SM,
  },
  EXPORT: {
    label: BUTTON_LABELS.EXPORT,
    icon: BUTTON_ICONS.EXPORT as string,
    variant: BUTTON_VARIANTS.OUTLINE,
    size: BUTTON_SIZES.SM,
  },
  IMPORT: {
    label: BUTTON_LABELS.IMPORT,
    icon: BUTTON_ICONS.IMPORT as string,
    variant: BUTTON_VARIANTS.OUTLINE,
    size: BUTTON_SIZES.SM,
  },
  SAVE: {
    label: BUTTON_LABELS.SAVE,
    icon: undefined,
    variant: BUTTON_VARIANTS.PRIMARY,
    size: BUTTON_SIZES.SM,
  },
  APPROVE: {
    label: BUTTON_LABELS.APPROVE,
    icon: BUTTON_ICONS.APPROVE as string,
    variant: BUTTON_VARIANTS.PRIMARY,
    size: BUTTON_SIZES.SM,
  },
  REJECT: {
    label: BUTTON_LABELS.REJECT,
    icon: BUTTON_ICONS.REJECT as string,
    variant: BUTTON_VARIANTS.DESTRUCTIVE,
    size: BUTTON_SIZES.SM,
  },
} as const;

// ── Status Colors ──────────────────────────────────────────────────────────
export const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
  draft: "bg-yellow-100 text-yellow-800",
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-red-100 text-red-800",
  completed: "bg-green-100 text-green-800",
  paid: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  expired: "bg-gray-100 text-gray-800",
  suspended: "bg-red-100 text-red-800",
  archived: "bg-gray-100 text-gray-800",
  loading: "bg-blue-100 text-blue-800",
  departed: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  processing: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-800",
};

// ── Plan Colors ────────────────────────────────────────────────────────────
export const PLAN_COLORS: Record<string, string> = {
  starter: "bg-slate-100 text-slate-700",
  growth: "bg-blue-100 text-blue-700",
  business: "bg-purple-100 text-purple-700",
  enterprise: "bg-amber-100 text-amber-700",
  custom: "bg-green-100 text-green-700",
};

// ── Severity Colors ────────────────────────────────────────────────────────
export const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-blue-100 text-blue-800",
  info: "bg-gray-100 text-gray-800",
};
