import type { DashboardData } from "@/lib/types";

const DEFAULT_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 1800);

type GeminiEnvelope = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

type GeminiNarrativeResponse = {
  headline?: unknown;
  overview?: unknown;
  insights?: unknown;
  eventInsights?: unknown;
};

type EventInsightPatch = {
  id: string;
  insight: string;
};

function asTrimmedString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asInsightList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const next = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);

  return next.length ? next : fallback;
}

function asEventInsightList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as { id?: unknown; insight?: unknown };
      if (typeof candidate.id !== "string" || typeof candidate.insight !== "string") {
        return null;
      }

      const id = candidate.id.trim();
      const insight = candidate.insight.trim();

      if (!id || !insight) {
        return null;
      }

      return { id, insight };
    })
    .filter((item): item is EventInsightPatch => Boolean(item));
}

function buildPrompt(data: DashboardData) {
  return JSON.stringify(
    {
      task: "Rewrite dashboard narratives for a fast global intelligence UI.",
      rules: [
        "Use only the provided event data.",
        "Be concise, factual, and fast to scan.",
        "Do not invent actors, causes, or impacts that are not in the data.",
        "If confidence is not high, use cautious wording.",
        "Keep the headline under 12 words.",
        "Keep the overview under 36 words.",
        "Keep each insight under 24 words.",
        "Keep each event insight under 28 words.",
        "Return JSON only.",
      ],
      outputShape: {
        headline: "string",
        overview: "string",
        insights: ["string"],
        eventInsights: [{ id: "event-id", insight: "string" }],
      },
      dashboard: {
        generatedAt: data.generatedAt,
        topMetrics: data.metrics.slice(0, 4),
        sectors: data.sectors.slice(0, 3),
        regions: data.regionalPulses.slice(0, 3),
        events: data.events.slice(0, 8).map((event) => ({
          id: event.id,
          title: event.title,
          category: event.category,
          location: event.location.label,
          region: event.location.region,
          severityLabel: event.severityLabel,
          severityScore: event.severityScore,
          confidenceLabel: event.confidenceLabel,
          sourceCount: event.sourceCount,
          sources: event.sources,
          summary: event.summary,
          heuristicInsight: event.insight,
          likelyImpacts: event.likelyImpacts,
          predictions: event.predictionSignals,
        })),
      },
    },
    null,
    2,
  );
}

function extractText(payload: GeminiEnvelope) {
  return (
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

async function requestGemini(prompt: string, signal: AbortSignal) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent`,
    {
      method: "POST",
      signal,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text: "You are a global intelligence editor. Rewrite existing dashboard narratives for clarity, brevity, and operational usefulness. Output JSON only.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          responseMimeType: "application/json",
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed with ${response.status}`);
  }

  return (await response.json()) as GeminiEnvelope;
}

export async function enhanceDashboardWithGemini(data: DashboardData): Promise<DashboardData> {
  if (!process.env.GEMINI_API_KEY?.trim() || !data.events.length) {
    return data;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const payload = await requestGemini(buildPrompt(data), controller.signal);
    if (!payload) {
      return data;
    }

    const rawText = extractText(payload);
    if (!rawText) {
      return data;
    }

    const parsed = JSON.parse(rawText) as GeminiNarrativeResponse;
    const eventPatches = new Map(
      asEventInsightList(parsed.eventInsights).map((item) => [item.id, item.insight]),
    );

    return {
      ...data,
      narrativeProvider: DEFAULT_MODEL,
      headline: asTrimmedString(parsed.headline, data.headline),
      overview: asTrimmedString(parsed.overview, data.overview),
      insights: asInsightList(parsed.insights, data.insights),
      events: data.events.map((event) =>
        eventPatches.has(event.id)
          ? {
              ...event,
              insight: eventPatches.get(event.id) ?? event.insight,
            }
          : event,
      ),
    };
  } catch {
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}
