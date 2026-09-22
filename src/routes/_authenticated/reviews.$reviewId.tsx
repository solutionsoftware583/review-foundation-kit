import { createFileRoute } from "@tanstack/react-router";
import { ReviewValaApp, pageMeta } from "@/components/reviewvala-app";

const meta = pageMeta("Reviews");

export const Route = createFileRoute("/_authenticated/reviews/$reviewId")({
  head: () => ({
    meta: [
      { title: `Review detail — ${meta.title}` },
      { name: "description", content: "Open a single customer review with its response workflow, notes and activity history." },
      { property: "og:title", content: `Review detail — ${meta.title}` },
      { property: "og:description", content: "Open a single customer review with its response workflow, notes and activity history." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewDetailRoute,
});

function ReviewDetailRoute() {
  const { reviewId } = Route.useParams();
  return <ReviewValaApp page="Reviews" focusId={reviewId} />;
}
