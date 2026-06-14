/**
 * ConfirmDeleteButton — reusable button with AlertDialog confirmation.
 *
 * Usage:
 *   <ConfirmDeleteButton
 *     onConfirm={async () => { await api.delete(...); qc.invalidateQueries(...); }}
 *     label="Are you sure you want to delete this item?"
 *   />
 *
 *   // Custom trigger (e.g. Deactivate button):
 *   <ConfirmDeleteButton
 *     trigger={<Button variant="outline">Deactivate</Button>}
 *     onConfirm={...}
 *   />
 */
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface ConfirmDeleteButtonProps {
  /** Async function to call on confirm. Should throw on error. */
  onConfirm: () => Promise<void>;
  /** Optional descriptive label shown in the dialog body. */
  label?: string;
  /** Title override (default "Delete this record?") */
  title?: string;
  /** Confirm button text (default "Delete") */
  confirmText?: string;
  /** Disable the trigger button */
  disabled?: boolean;
  /** Success toast message */
  successMessage?: string;
  /** Error toast message */
  errorMessage?: string;
  /**
   * Custom trigger element. When provided, replaces the default Trash2 icon button.
   * The element is wrapped in AlertDialogTrigger asChild, so it must accept onClick.
   */
  trigger?: React.ReactNode;
}

export function ConfirmDeleteButton({
  onConfirm,
  label = "This action cannot be undone.",
  title = "Delete this record?",
  confirmText = "Delete",
  disabled = false,
  successMessage = "Deleted successfully",
  errorMessage = "Delete failed",
  trigger,
}: ConfirmDeleteButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      toast.success(successMessage);
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? errorMessage;
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            disabled={disabled || loading}
            title="Delete"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{label}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Processing…" : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
