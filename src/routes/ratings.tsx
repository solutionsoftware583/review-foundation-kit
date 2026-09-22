import { createFileRoute } from "@tanstack/react-router";
import { ReviewValaApp, pageMeta } from "@/components/reviewvala-app";

const meta = pageMeta("Ratings");

export const Route = createFileRoute("/ratings")({
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
  component: () => <ReviewValaApp page="Ratings" />,
});
