import { createFileRoute } from "@tanstack/react-router";
import { ReviewValaApp, pageMeta } from "@/components/reviewvala-app";

const meta = pageMeta("Reviews");

export const Route = createFileRoute("/_authenticated/reviews")({
  validateSearch: (search: Record<string, unknown>): { review?: string } =>
    typeof search['review'] === "string" && search['review'] ? { review: search['review'] } : {},
  head: () => ({
    meta: [
      { title: meta.title },
      { name: "description", content: meta.description },
      { property: "og:title", content: meta.title },
      { property: "og:description", content: meta.description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewsRoute,
});

function ReviewsRoute() {
  const { review } = Route.useSearch();
  return <ReviewValaApp page="Reviews" focusId={review ?? null} />;
}
