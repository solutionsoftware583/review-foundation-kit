import { createFileRoute } from "@tanstack/react-router";
import { ReviewValaApp, pageMeta } from "@/components/reviewvala-app";

const meta = pageMeta("Overview");

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "ReviewVala™ — Reputation Workspace" },
      { name: "description", content: meta.description },
      { property: "og:title", content: "ReviewVala™ — Reputation Workspace" },
      { property: "og:description", content: meta.description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <ReviewValaApp page="Overview" />,
});
