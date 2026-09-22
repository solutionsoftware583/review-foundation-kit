import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WORKSPACE = "northstar-group";
const MODEL = "openai/gpt-6-astra";

const inputSchema = z.object({
  text: z.string().trim().min(20, "Add at least 20 characters of review text.").max(6000),
  reviewId: z.string().uuid().nullable().optional(),
});

const analysisSchema = z.object({
  headline: z.string().min(1),
  sentiment: z.enum(["Positive", "Mixed", "Negative"]),
  severity: z.enum(["Low", "Medium", "High", "Critical"]),
  themes: z.array(z.string()).max(6).default([]),
  root_causes: z
    .array(z.object({ cause: z.string(), evidence: z.string(), confidence: z.enum(["Low", "Medium", "High"]) }))
    .max(6)
    .default([]),
  recommendations: z
    .array(
      z.object({
        action: z.string(),
        owner: z.string(),
        effort: z.enum(["Low", "Medium", "High"]),
        impact: z.enum(["Low", "Medium", "High"]),
        timeframe: z.string(),
      }),
    )
    .max(6)
    .default([]),
});

export type ReviewAnalysis = z.infer<typeof analysisSchema>;

const SYSTEM_PROMPT = `You are a service-operations analyst for a multi-location hospitality and retail group.
Given raw customer review text, identify the underlying operational root causes and recommend concrete, internal service improvements.
Be specific and grounded in the text. Never invent facts that are not implied. Never suggest contacting external review platforms or APIs.
Owners must be internal roles such as Store Manager, Shift Lead, Training Lead, Operations Manager or Customer Care Lead.
Respond with JSON only, matching the requested schema exactly.`;

export const analyzeReviewText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const membership = await supabase
      .from("reviewvala_members")
      .select("role, status, email, full_name, workspace_slug")
      .eq("user_id", userId)
      .eq("workspace_slug", WORKSPACE)
      .maybeSingle();

    if (membership.error) throw new Error("Workspace access could not be verified.");
    const member = membership.data;
    if (!member || member.status !== "Active") throw new Error("Your workspace access is not active yet.");
    if (!["Admin", "Manager", "Responder"].includes(member.role)) throw new Error("Your role cannot run AI analysis.");

    const author = member.full_name || member.email || "Member";

    let reviewId: string | null = null;
    if (data.reviewId) {
      const owned = await supabase
        .from("reviewvala_reviews")
        .select("id")
        .eq("id", data.reviewId)
        .eq("workspace_slug", WORKSPACE)
        .maybeSingle();
      if (owned.error || !owned.data) throw new Error("That review is not part of your workspace.");
      reviewId = owned.data.id;
    }

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace.");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        instructions: SYSTEM_PROMPT,
        reasoning: { effort: "low", summary: "auto" },
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Analyse this customer review. headline is one sentence. themes: up to 4 short labels. root_causes: up to 4 items with cause, evidence quoted or paraphrased from the review, and confidence. recommendations: up to 4 items with action, internal owner role, effort, impact and a timeframe such as "This week".\n\nREVIEW TEXT:\n${data.text}`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "review_analysis",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["headline", "sentiment", "severity", "themes", "root_causes", "recommendations"],
              properties: {
                headline: { type: "string" },
                sentiment: { type: "string", enum: ["Positive", "Mixed", "Negative"] },
                severity: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
                themes: { type: "array", items: { type: "string" } },
                root_causes: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["cause", "evidence", "confidence"],
                    properties: {
                      cause: { type: "string" },
                      evidence: { type: "string" },
                      confidence: { type: "string", enum: ["Low", "Medium", "High"] },
                    },
                  },
                },
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["action", "owner", "effort", "impact", "timeframe"],
                    properties: {
                      action: { type: "string" },
                      owner: { type: "string" },
                      effort: { type: "string", enum: ["Low", "Medium", "High"] },
                      impact: { type: "string", enum: ["Low", "Medium", "High"] },
                      timeframe: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    });

    if (response.status === 429) throw new Error("AI rate limit reached. Try again in a moment.");
    if (response.status === 402) throw new Error("AI credits are exhausted for this workspace.");
    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      console.error("[insights] AI gateway error", response.status, detail);
      throw new Error("The analysis service is unavailable right now.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const event = JSON.parse(payload) as { type?: string; delta?: string; response?: { output_text?: string } };
          if (event.type === "response.output_text.delta" && typeof event.delta === "string") content += event.delta;
          else if (event.type === "response.completed" && typeof event.response?.output_text === "string" && !content) content = event.response.output_text;
        } catch {
          /* ignore keep-alive and partial frames */
        }
      }
    }

    if (!content.trim()) throw new Error("The analysis came back empty. Try again.");


    let parsed: ReviewAnalysis;
    try {
      parsed = analysisSchema.parse(JSON.parse(content));
    } catch (error) {
      console.error("[insights] invalid analysis payload", error);
      throw new Error("The analysis could not be read. Try again.");
    }

    const { data: saved, error } = await supabase
      .from("reviewvala_insights")
      .insert({
        workspace_slug: WORKSPACE,
        review_id: reviewId,
        source_text: data.text,
        headline: parsed.headline,
        sentiment: parsed.sentiment,
        severity: parsed.severity,
        themes: parsed.themes,
        root_causes: parsed.root_causes,
        recommendations: parsed.recommendations,
        model: MODEL,
        created_by: author,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[insights] save failed", error);
      throw new Error("The analysis was generated but could not be saved.");
    }

    return { id: saved.id, ...parsed };
  });
