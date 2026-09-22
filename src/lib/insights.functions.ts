import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const WORKSPACE = "northstar-group";
const MODEL = "google/gemini-2.5-flash";

const inputSchema = z.object({
  text: z.string().trim().min(20, "Add at least 20 characters of review text.").max(6000),
  reviewId: z.string().uuid().nullable().optional(),
  author: z.string().trim().min(1).max(80).default("Riya Sharma"),
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
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this workspace.");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Analyse this customer review and return JSON with keys: headline (one sentence), sentiment (Positive|Mixed|Negative), severity (Low|Medium|High|Critical), themes (up to 4 short labels), root_causes (up to 4 objects with cause, evidence quoted or paraphrased from the review, confidence Low|Medium|High), recommendations (up to 4 objects with action, owner, effort Low|Medium|High, impact Low|Medium|High, timeframe such as "This week").\n\nREVIEW TEXT:\n${data.text}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
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
    if (!response.ok) {
      const detail = await response.text();
      console.error("[insights] AI gateway error", response.status, detail);
      throw new Error("The analysis service is unavailable right now.");
    }

    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("The analysis came back empty. Try again.");

    let parsed: ReviewAnalysis;
    try {
      parsed = analysisSchema.parse(JSON.parse(content));
    } catch (error) {
      console.error("[insights] invalid analysis payload", error);
      throw new Error("The analysis could not be read. Try again.");
    }

    const supabase = createClient<Database>(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );

    const { data: saved, error } = await supabase
      .from("reviewvala_insights")
      .insert({
        workspace_slug: WORKSPACE,
        review_id: data.reviewId ?? null,
        source_text: data.text,
        headline: parsed.headline,
        sentiment: parsed.sentiment,
        severity: parsed.severity,
        themes: parsed.themes,
        root_causes: parsed.root_causes,
        recommendations: parsed.recommendations,
        model: MODEL,
        created_by: data.author,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[insights] save failed", error);
      throw new Error("The analysis was generated but could not be saved.");
    }

    return { id: saved.id, ...parsed };
  });
