import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { X, ChevronLeft, ChevronRight, SkipForward, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface TourStep {
  target: string;
  title: string;
  content: string;
}

interface ProductTour {
  id: string;
  title: string;
  slug: string;
  target_page: string;
  steps: TourStep[];
}

interface TourProgress {
  current_step: number;
  completed: boolean;
  skipped: boolean;
}

export function TourOverlay() {
  const { user } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();
  const [activeTour, setActiveTour] = useState<ProductTour | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetEl, setTargetEl] = useState<Element | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const path = location.pathname;

  const { data: tours } = useQuery({
    queryKey: ["tours", path],
    queryFn: () =>
      api.get(`/tours?page=${encodeURIComponent(path)}`).then((r) => r.data.data ?? []),
    staleTime: 300_000,
    enabled: !!user && !dismissed.has(path),
  });

  const progressMut = useMutation({
    mutationFn: ({ slug, action }: { slug: string; action: string }) =>
      api.post(`/tours/${slug}/progress`, { action }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tours"] }),
  });

  useEffect(() => {
    const tourList: ProductTour[] = tours ?? [];
    const match = tourList[0];
    if (match && !dismissed.has(match.slug)) {
      setActiveTour(match);
      setStepIndex(0);
    } else {
      setActiveTour(null);
    }
  }, [tours, dismissed]);

  useEffect(() => {
    if (!activeTour || !activeTour.steps[stepIndex]) {
      setTargetEl(null);
      return;
    }
    const target = activeTour.steps[stepIndex].target;
    const el = document.querySelector(target);
    setTargetEl(el);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeTour, stepIndex]);

  const handleNext = useCallback(() => {
    if (!activeTour) return;
    if (stepIndex < activeTour.steps.length - 1) {
      setStepIndex((i) => i + 1);
      progressMut.mutate({ slug: activeTour.slug, action: "next" });
    } else {
      progressMut.mutate({ slug: activeTour.slug, action: "next" });
      setActiveTour(null);
    }
  }, [activeTour, stepIndex, progressMut]);

  const handlePrev = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
      progressMut.mutate({ slug: activeTour!.slug, action: "prev" });
    }
  }, [stepIndex, progressMut]);

  const handleSkip = useCallback(() => {
    if (!activeTour) return;
    progressMut.mutate({ slug: activeTour.slug, action: "skip" });
    setDismissed((prev) => new Set(prev).add(activeTour.slug));
    setActiveTour(null);
  }, [activeTour, progressMut]);

  const handleClose = useCallback(() => {
    if (activeTour) {
      setDismissed((prev) => new Set(prev).add(activeTour.slug));
    }
    setActiveTour(null);
  }, [activeTour]);

  if (!activeTour) return null;

  const step = activeTour.steps[stepIndex];
  const isLast = stepIndex >= activeTour.steps.length - 1;
  const total = activeTour.steps.length;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/10" onClick={handleClose} />

      {/* Tooltip */}
      <div
        className={cn(
          "fixed z-50 w-80 bg-white rounded-xl shadow-2xl border p-4 space-y-3 transition-all",
          targetEl ? "opacity-100" : "opacity-0",
        )}
        style={
          targetEl
            ? {
                top: targetEl.getBoundingClientRect().bottom + 12,
                left: Math.max(
                  16,
                  Math.min(
                    targetEl.getBoundingClientRect().left +
                      targetEl.getBoundingClientRect().width / 2 -
                      160,
                    window.innerWidth - 336,
                  ),
                ),
              }
            : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">
            {activeTour.title} · Step {stepIndex + 1}/{total}
          </span>
          <button onClick={handleClose} className="p-0.5 rounded hover:bg-gray-100">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full transition-all"
            style={{ width: `${((stepIndex + 1) / total) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div>
          <p className="text-sm font-semibold text-gray-900">{step?.title ?? ""}</p>
          <p className="text-xs text-muted-foreground mt-1">{step?.content ?? ""}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={handleSkip}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600"
          >
            <SkipForward className="w-3 h-3" /> Skip Tour
          </button>
          <div className="flex items-center gap-1.5">
            {stepIndex > 0 && (
              <button
                onClick={handlePrev}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              {isLast ? (
                <>
                  Done <Check className="w-3 h-3" />
                </>
              ) : (
                <>
                  Next <ChevronRight className="w-3 h-3" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
