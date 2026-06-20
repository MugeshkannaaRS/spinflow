import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { HelpCircle, X, ChevronRight, ExternalLink, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface HelpArticle {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
}

export function HelpWidget() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const page = location.pathname.split("/").filter(Boolean)[0] || "dashboard";

  const { data } = useQuery({
    queryKey: ["context-help", page],
    queryFn: () => api.get(`/customer/help/context/${page}`).then((r) => r.data.data ?? []),
    enabled: open,
    staleTime: 300_000,
  });

  const articles: HelpArticle[] = data ?? [];

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all",
          open ? "bg-gray-800 text-white" : "bg-blue-600 text-white hover:bg-blue-700",
        )}
      >
        {open ? <X className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-40 w-80 max-h-96 bg-white rounded-xl shadow-2xl border overflow-y-auto">
          <div className="p-3 border-b bg-gray-50">
            <p className="text-xs font-semibold text-gray-900">Help & Resources</p>
            <p className="text-[10px] text-muted-foreground">Context-aware guides for this page</p>
          </div>
          <div className="p-2 space-y-1">
            {articles.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">No guides for this page</p>
            ) : (
              articles.map((a) => (
                <a
                  key={a.id}
                  href={`/help-center?article=${a.slug}`}
                  className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <BookOpen className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-900">{a.title}</p>
                    {a.summary && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                        {a.summary}
                      </p>
                    )}
                  </div>
                </a>
              ))
            )}
            <div className="pt-1">
              <a
                href="/help-center"
                className="flex items-center gap-1 text-[10px] text-blue-600 hover:underline px-2 py-1"
              >
                Browse Help Center <ChevronRight className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
