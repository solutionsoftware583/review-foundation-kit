import { createFileRoute } from "@tanstack/react-router";
import { ReviewValaApp } from "@/components/reviewvala-app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ReviewVala™ — Reputation Workspace" },
      { name: "description", content: "Manage reviews, responses, ratings, and reputation insights across every business and location." },
      { property: "og:title", content: "ReviewVala™ — Reputation Workspace" },
      { property: "og:description", content: "A trusted workspace for reviews, responses, ratings, and reputation insights." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <ReviewValaApp />;
}
