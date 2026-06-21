/**
 * DraftBanner — amber banner shown when unsaved draft data exists for a form.
 * Drop it just above the form table in any entry component.
 */

interface DraftBannerProps {
  onRestore: () => void;
  onDiscard: () => void;
  message?: string;
}

export function DraftBanner({
  onRestore,
  onDiscard,
  message = "You have unsaved draft data for this entry. Restore it?",
}: DraftBannerProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm">
      <div className="flex items-center gap-2 text-amber-800">
        <span className="text-base">📋</span>
        <span>{message}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onRestore}
          className="px-3 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition-colors"
        >
          Restore
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="px-3 py-1 rounded-md border border-amber-300 hover:bg-amber-100 text-amber-700 text-xs font-medium transition-colors"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
