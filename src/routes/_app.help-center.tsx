import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, BookOpen, ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/help-center")({
  head: () => ({ meta: [{ title: "Help Center — SpinFlow ERP" }] }),
  component: HelpCenterPage,
});

interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

interface Article {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  category_id: string | null;
  tags: string[] | null;
  video_url: string | null;
}

function HelpCenterPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const { data: cats } = useQuery({
    queryKey: ["help-categories"],
    queryFn: () => api.get("/customer/help/categories").then((r) => r.data.data ?? []),
    staleTime: 300_000,
  });

  const { data: articles } = useQuery({
    queryKey: ["help-articles", selectedCategory, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedCategory) params.set("category_slug", selectedCategory);
      if (search) params.set("search", search);
      return api.get(`/customer/help/articles?${params}`).then((r) => r.data.data ?? []);
    },
    staleTime: 30_000,
  });

  const { data: articleDetail } = useQuery({
    queryKey: ["help-article", selectedArticle?.slug],
    queryFn: () => api.get(`/customer/help/articles/${selectedArticle!.slug}`).then((r) => r.data),
    enabled: !!selectedArticle,
  });

  const categories: Category[] = cats ?? [];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Help Center</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Guides, tutorials, and reference documentation
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Search help articles…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedCategory(null);
          }}
        />
      </div>

      {selectedArticle ? (
        /* Article detail */
        <div className="space-y-4">
          <button
            onClick={() => setSelectedArticle(null)}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            <ChevronRight className="w-3 h-3 rotate-180" /> Back to articles
          </button>
          <Card>
            <CardContent className="p-6 prose prose-sm max-w-none">
              <h1 className="text-lg font-bold text-gray-900 mb-2">{articleDetail?.title}</h1>
              {articleDetail?.summary && (
                <p className="text-sm text-muted-foreground mb-4">{articleDetail.summary}</p>
              )}
              {articleDetail?.video_url && (
                <a
                  href={articleDetail.video_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 mb-4"
                >
                  <ExternalLink className="w-3 h-3" /> Watch Video Tutorial
                </a>
              )}
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {articleDetail?.content}
              </div>
              {articleDetail?.tags && articleDetail.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t">
                  {articleDetail.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          {/* Categories */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
                !selectedCategory
                  ? "bg-gray-900 border-gray-900 text-white"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50",
              )}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(selectedCategory === cat.slug ? null : cat.slug)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
                  selectedCategory === cat.slug
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50",
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Articles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(articles ?? []).map((article: Article) => (
              <button
                key={article.id}
                onClick={() => setSelectedArticle(article)}
                className="text-left bg-white rounded-xl border p-4 hover:shadow-sm hover:border-gray-300 transition-all"
              >
                <div className="flex items-start gap-3">
                  <BookOpen className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{article.title}</p>
                    {article.summary && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {article.summary}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {(!articles || articles.length === 0) && (
              <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                No articles found
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
