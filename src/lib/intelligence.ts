import type {
  DashboardData,
  DashboardMetric,
  EventCategory,
  EventSourceName,
  IntelligenceEvent,
  PredictionCard,
  PredictionSignal,
  RegionalPulse,
  SectorImpact,
  SeverityLabel,
  SourceHealth,
} from "@/lib/types";
import { enhanceDashboardWithGemini } from "@/lib/gemini";

const FEEDS = {
  gdacs: "https://www.gdacs.org/gdacsapi/api/events/geteventlist/events4app",
  usgs: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
  eonet: "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=25",
};

const HEADERS = {
  Accept: "application/json",
  "User-Agent": "global-situation-intelligence-dashboard/0.1",
};

const GDACS_MAP: Record<string, EventCategory> = {
  DR: "drought",
  EQ: "seismic",
  FL: "flood",
  TC: "cyclone",
  VO: "volcano",
  WF: "wildfire",
};

const EONET_MAP: Record<string, EventCategory> = {
  drought: "drought",
  earthquakes: "seismic",
  floods: "flood",
  landslides: "weather",
  seaLakeIce: "weather",
  severeStorms: "weather",
  volcanoes: "volcano",
  waterColor: "weather",
  wildfires: "wildfire",
};

const IMPACTS: Record<EventCategory, string[]> = {
  cyclone: ["port disruption", "power outages", "humanitarian response", "commodity volatility"],
  drought: ["crop stress", "food inflation", "hydropower pressure", "migration risk"],
  flood: ["transport disruption", "housing damage", "agriculture losses", "insurance claims"],
  seismic: ["infrastructure inspections", "logistics delays", "insurance exposure", "aftershock risk"],
  volcano: ["aviation disruption", "air quality pressure", "tourism losses", "supply rerouting"],
  weather: ["mobility disruption", "localized outages", "response coordination", "short-term market noise"],
  wildfire: ["air quality stress", "grid instability", "evacuation pressure", "timber and crop losses"],
};

const SECTORS: Record<EventCategory, Array<{ sector: string; weight: number }>> = {
  cyclone: [
    { sector: "Logistics", weight: 28 },
    { sector: "Energy", weight: 24 },
    { sector: "Humanitarian", weight: 32 },
  ],
  drought: [
    { sector: "Agriculture", weight: 34 },
    { sector: "Food Markets", weight: 28 },
    { sector: "Water Security", weight: 30 },
  ],
  flood: [
    { sector: "Logistics", weight: 24 },
    { sector: "Agriculture", weight: 22 },
    { sector: "Insurance", weight: 24 },
  ],
  seismic: [
    { sector: "Supply Chain", weight: 26 },
    { sector: "Insurance", weight: 26 },
    { sector: "Mobility", weight: 18 },
  ],
  volcano: [
    { sector: "Aviation", weight: 30 },
    { sector: "Tourism", weight: 18 },
    { sector: "Public Health", weight: 14 },
  ],
  weather: [
    { sector: "Mobility", weight: 18 },
    { sector: "Energy", weight: 18 },
    { sector: "Humanitarian", weight: 14 },
  ],
  wildfire: [
    { sector: "Public Health", weight: 24 },
    { sector: "Utilities", weight: 22 },
    { sector: "Agriculture", weight: 18 },
  ],
};

const BASE_CONFIDENCE: Record<EventSourceName, number> = {
  GDACS: 88,
  "NASA EONET": 84,
  USGS: 92,
};

type FeedResult = {
  source: EventSourceName;
  events: IntelligenceEvent[];
  ok: boolean;
  detail: string;
  updatedAt: string;
};

type GdacsFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    alertlevel?: string;
    country?: string;
    datemodified?: string;
    description?: string;
    episodealertscore?: number;
    episodeid?: number;
    eventid?: number;
    eventtype?: string;
    fromdate?: string;
    htmldescription?: string;
    name?: string;
    severitydata?: {
      severity?: number;
      severitytext?: string;
      severityunit?: string;
    };
    source?: string;
    url?: {
      report?: string;
    };
  };
};

type UsgsFeature = {
  id?: string;
  geometry?: { coordinates?: [number, number, number] };
  properties?: {
    alert?: string | null;
    mag?: number | null;
    magType?: string | null;
    place?: string | null;
    sig?: number | null;
    time?: number | null;
    title?: string | null;
    tsunami?: number | null;
    type?: string | null;
    updated?: number | null;
    url?: string | null;
  };
};

type EonetEvent = {
  categories?: Array<{ id?: string; title?: string }>;
  description?: string | null;
  geometry?: Array<{
    coordinates?: unknown;
    date?: string;
    magnitudeUnit?: string | null;
    magnitudeValue?: number | null;
  }>;
  id?: string;
  link?: string;
  sources?: Array<{ url?: string }>;
  title?: string;
};

type GdacsPayload = { features?: GdacsFeature[] };
type UsgsPayload = { features?: UsgsFeature[] };
type EonetPayload = { events?: EonetEvent[] };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const uniq = <T,>(values: T[]) => [...new Set(values)];
const clean = (value?: string | null) => (value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const titleCase = (value: string) => value.replace(/[_-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const severityLabel = (score: number): SeverityLabel =>
  score >= 85 ? "critical" : score >= 70 ? "high" : score >= 45 ? "moderate" : "watch";

const confidenceLabel = (score: number, sources: number) =>
  sources >= 2 && score >= 90
    ? "cross-source corroborated"
    : score >= 88
      ? "official high-confidence"
      : sources >= 2
        ? "official multi-signal"
        : "official single-source";

const iso = (value?: string | number | null) => {
  if (value === null || value === undefined) return new Date().toISOString();
  return new Date(value).toISOString();
};

const fmt = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));

const formatMagnitude = (value?: number | null, unit?: string | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "Undisclosed";
  return unit ? `${value.toFixed(1)} ${unit}` : value.toFixed(1);
};

const region = (lat: number, lon: number) => {
  if (lon <= -30) return "Americas";
  if (lon > -30 && lon < 40) return lat < 15 ? "Africa" : "Europe";
  if (lon >= 40 && lon < 70) return "Middle East";
  if (lon >= 70 && lon <= 180) return "Asia-Pacific";
  return lat < 0 ? "Southern Ocean" : "Open Ocean";
};

const hoursBetween = (a: string, b: string) =>
  Math.abs(new Date(a).valueOf() - new Date(b).valueOf()) / 3_600_000;

const distKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 6371 * (2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
};

const fetchJson = async <T,>(url: string) => {
  const response = await fetch(url, { cache: "no-store", headers: HEADERS });
  if (!response.ok) throw new Error(`Feed request failed with ${response.status}`);
  return (await response.json()) as T;
};

type DashboardBuildOptions = {
  narrativeMode?: "heuristic" | "gemini";
};

function predictions(category: EventCategory, score: number, impacts: string[]): PredictionSignal[] {
  const first = impacts[0]?.toLowerCase() ?? "disruption";
  const second = impacts[1]?.toLowerCase() ?? "operational pressure";
  const templates: Record<EventCategory, [string, string, string]> = {
    cyclone: [
      "Port and power disruption risk should stay elevated as the weather system evolves.",
      "Cross-border logistics may tighten if rainfall bands or storm surge widen.",
      "Insurance, humanitarian, and commodity effects can ripple for a week if landfall intensifies.",
    ],
    drought: [
      "Water and crop stress are likely to keep building in the near term.",
      "Food price and hydropower pressure may expand if dry conditions persist.",
      "A sustained drought window would push broader migration and import dependency risk higher.",
    ],
    flood: [
      "Transport bottlenecks and local displacement risk should remain elevated through the next day.",
      "Supply rerouting becomes more likely if rainfall persists across affected corridors.",
      "Recovery, insurance, and agriculture impacts may compound over the week ahead.",
    ],
    seismic: [
      "Aftershock monitoring and infrastructure checks are likely to stay elevated in the next 24 hours.",
      "Local logistics and insurance assessments may intensify if transport nodes were affected.",
      "Secondary supply chain delays can linger for the week if ports, roads, or power assets were hit.",
    ],
    volcano: [
      "Aviation and air quality monitoring are likely to stay elevated near the plume footprint.",
      "Regional flight schedules and tourism flows may tighten if ash advisories expand.",
      "A prolonged eruptive phase could produce week-long logistics and public health impacts.",
    ],
    weather: [
      "Localized mobility and outage risk should stay elevated through the next operational cycle.",
      "Emergency response load may spread if forecast models broaden the impact area.",
      "Repeated weather pulses can amplify logistics and retail losses over the coming week.",
    ],
    wildfire: [
      "Air quality and grid pressure are likely to stay elevated near the fire perimeter.",
      "Evacuations and transport detours may widen if burn area growth continues.",
      "Insurance, timber, and crop exposure may compound over the next week in sustained fire conditions.",
    ],
  };
  const [a, b, c] = templates[category];
  const boost = score / 100;
  return [
    { horizon: "24h", probability: clamp(50 + boost * 35, 42, 97), summary: `${a} Primary concern: ${first}.` },
    { horizon: "72h", probability: clamp(42 + boost * 38, 36, 94), summary: `${b} Secondary concern: ${second}.` },
    { horizon: "7d", probability: clamp(28 + boost * 34, 24, 88), summary: c },
  ];
}

function insight(title: string, place: string, score: number, impacts: string[], sourceCount: number) {
  const prefix = sourceCount > 1 ? "Cross-source fusion suggests" : "Official monitoring shows";
  const horizon = score >= 78 ? "72 hours" : "24 to 48 hours";
  return `${prefix} ${title.toLowerCase()} is raising ${(impacts[0] ?? "disruption").toLowerCase()} and ${(impacts[1] ?? "sector stress").toLowerCase()} risk around ${place} over the next ${horizon}.`;
}

function status(updatedAt: string, score: number) {
  const age = hoursBetween(updatedAt, new Date().toISOString());
  if (score >= 80 && age < 24) return "active";
  if (age < 48) return "evolving";
  return "monitoring";
}

function eventOf(input: Omit<IntelligenceEvent, "severityLabel" | "confidenceLabel" | "predictionSignals" | "insight">) {
  const item: IntelligenceEvent = {
    ...input,
    severityLabel: severityLabel(input.severityScore),
    confidenceLabel: confidenceLabel(input.confidenceScore, input.sourceCount),
    predictionSignals: predictions(input.category, input.severityScore, input.likelyImpacts),
    insight: "",
  };
  item.insight = insight(item.title, item.location.label, item.severityScore, item.likelyImpacts, item.sourceCount);
  return item;
}

function scoreGdacs(type: string | undefined, alertLevel: string | undefined, severity: number) {
  const base = { green: 36, orange: 72, red: 92 }[(alertLevel ?? "green").toLowerCase()] ?? 40;
  if (type === "EQ") return clamp(base + severity * 7, 28, 100);
  if (type === "TC") return clamp(base + severity / 3.3, 30, 100);
  if (type === "WF") return clamp(base + Math.log10(severity + 1) * 18, 26, 96);
  if (type === "FL") return clamp(base + severity * 6, 24, 95);
  if (type === "DR") return clamp(base + severity * 4, 24, 95);
  if (type === "VO") return clamp(base + severity * 8, 24, 100);
  return clamp(base + severity * 5, 22, 95);
}

function scoreUsgs(mag?: number | null, sig?: number | null, alert?: string | null) {
  const bonus = { orange: 16, red: 24, yellow: 8 }[alert?.toLowerCase() ?? ""] ?? 0;
  return clamp(18 + (mag ?? 0) * 11 + (sig ?? 0) / 12 + bonus, 20, 100);
}

function scoreEonet(category: EventCategory, magnitude?: number | null, unit?: string | null) {
  if (magnitude === null || magnitude === undefined || Number.isNaN(magnitude)) return category === "wildfire" ? 58 : 48;
  if (category === "wildfire") {
    const acres = unit?.toLowerCase().includes("acre") ? magnitude : magnitude * 2.47105;
    return clamp(32 + Math.log10(acres + 1) * 15, 32, 92);
  }
  if (category === "seismic") return clamp(24 + magnitude * 10, 26, 96);
  if (category === "weather" || category === "cyclone") return clamp(34 + magnitude / 4, 36, 92);
  return clamp(34 + magnitude * 6, 34, 90);
}

function pairCoords(value: unknown, acc: Array<[number, number]> = []) {
  if (Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number") {
    acc.push([Number(value[0]), Number(value[1])]);
    return acc;
  }
  if (Array.isArray(value)) for (const item of value) pairCoords(item, acc);
  return acc;
}

function centroid(value: unknown) {
  const pairs = pairCoords(value);
  if (!pairs.length) return null;
  const [lon, lat] = pairs.reduce((totals, pair) => [totals[0] + pair[0], totals[1] + pair[1]], [0, 0]);
  return { lon: lon / pairs.length, lat: lat / pairs.length };
}

function normalizeGdacs(item: GdacsFeature) {
  const p = item?.properties;
  const c = item?.geometry?.coordinates;
  if (!p || !c) return null;
  const category = GDACS_MAP[p.eventtype ?? ""] ?? "weather";
  const score = scoreGdacs(p.eventtype, p.alertlevel, Number(p.severitydata?.severity ?? p.episodealertscore ?? 0));
  return eventOf({
    id: `gdacs-${p.eventtype}-${p.eventid}-${p.episodeid}`,
    title: p.name ?? p.description ?? "GDACS event",
    category,
    subcategory: p.eventtype ? titleCase(p.eventtype) : titleCase(category),
    status: status(iso(p.datemodified ?? p.fromdate), score),
    location: {
      lat: c[1],
      lon: c[0],
      label: p.country ?? "Offshore event zone",
      country: p.country ?? "Unknown",
      region: region(c[1], c[0]),
    },
    startedAt: iso(p.fromdate),
    updatedAt: iso(p.datemodified ?? p.fromdate),
    severityScore: score,
    confidenceScore: BASE_CONFIDENCE.GDACS,
    sourceCount: 1,
    sources: ["GDACS"],
    sourceIds: [`${p.eventtype ?? "EVENT"}-${p.eventid ?? "unknown"}`],
    summary: clean(p.htmldescription) || clean(p.description) || clean(p.name) || "Live GDACS disaster signal.",
    likelyImpacts: IMPACTS[category],
    evidence: [{ source: "GDACS", label: "GDACS situation report", url: p.url?.report ?? "https://www.gdacs.org/" }],
    metrics: [
      { label: "Alert", value: p.alertlevel ? titleCase(p.alertlevel) : "Watch" },
      { label: "Severity", value: p.severitydata?.severitytext ?? formatMagnitude(Number(p.severitydata?.severity ?? p.episodealertscore ?? 0), p.severitydata?.severityunit) },
      { label: "Updated", value: fmt(iso(p.datemodified ?? p.fromdate)) },
    ],
    tags: uniq([titleCase(category), p.source ?? "GDACS", p.alertlevel ? titleCase(p.alertlevel) : "Watch"]),
  });
}

function normalizeUsgs(item: UsgsFeature) {
  const p = item?.properties;
  const c = item?.geometry?.coordinates;
  if (!p || !c) return null;
  const score = scoreUsgs(p.mag, p.sig, p.alert);
  const label = clean(p.place ?? p.title) || "Seismic impact zone";
  return eventOf({
    id: `usgs-${item.id ?? label.toLowerCase().replace(/\s+/g, "-")}`,
    title: p.title ?? p.place ?? "Earthquake",
    category: "seismic",
    subcategory: titleCase(p.type ?? "earthquake"),
    status: status(iso(p.updated), score),
    location: {
      lat: c[1],
      lon: c[0],
      label,
      country: label.split(",").at(-1)?.trim() || label,
      region: region(c[1], c[0]),
    },
    startedAt: iso(p.time),
    updatedAt: iso(p.updated),
    severityScore: score,
    confidenceScore: BASE_CONFIDENCE.USGS,
    sourceCount: 1,
    sources: ["USGS"],
    sourceIds: [item.id ?? label],
    summary: `${p.title ?? p.place ?? "Earthquake"} was reported by USGS with magnitude ${formatMagnitude(p.mag, p.magType)} and significance score ${p.sig ?? 0}.`,
    likelyImpacts: IMPACTS.seismic,
    evidence: [{ source: "USGS", label: "USGS earthquake page", url: p.url ?? "https://earthquake.usgs.gov/" }],
    metrics: [
      { label: "Magnitude", value: formatMagnitude(p.mag, p.magType) },
      { label: "Significance", value: `${p.sig ?? 0}` },
      { label: "Tsunami", value: p.tsunami ? "Watch required" : "No tsunami flag" },
    ],
    tags: uniq(["Earthquake", p.alert ? titleCase(p.alert) : "No formal alert", "USGS"]),
  });
}

function normalizeEonet(item: EonetEvent) {
  const latest = item?.geometry?.at(-1);
  const point = centroid(latest?.coordinates);
  if (!point) return null;
  const category = EONET_MAP[item?.categories?.[0]?.id ?? ""] ?? "weather";
  const label = item?.title?.split(",").slice(-2).join(",").trim() || item?.title || "Active natural event";
  const score = scoreEonet(category, latest?.magnitudeValue, latest?.magnitudeUnit);
  return eventOf({
    id: `eonet-${item?.id ?? label.toLowerCase().replace(/\s+/g, "-")}`,
    title: item?.title ?? "NASA EONET event",
    category,
    subcategory: item?.categories?.[0]?.title ?? titleCase(item?.categories?.[0]?.id ?? category),
    status: status(iso(latest?.date), score),
    location: {
      lat: point.lat,
      lon: point.lon,
      label,
      country: label,
      region: region(point.lat, point.lon),
    },
    startedAt: iso(item?.geometry?.[0]?.date ?? latest?.date),
    updatedAt: iso(latest?.date),
    severityScore: score,
    confidenceScore: BASE_CONFIDENCE["NASA EONET"],
    sourceCount: 1,
    sources: ["NASA EONET"],
    sourceIds: [item?.id ?? label],
    summary: clean(item?.description) || `${item?.title ?? "Natural event"} remains open in NASA EONET monitoring.`,
    likelyImpacts: IMPACTS[category],
    evidence: uniq([
      item?.link ?? "https://eonet.gsfc.nasa.gov/",
      ...((item?.sources ?? []).map((source) => source.url).filter(Boolean) as string[]),
    ]).map((url, index) => ({
      source: "NASA EONET" as const,
      label: index === 0 ? "NASA EONET event" : `Source ${index}`,
      url,
    })),
    metrics: [
      { label: "Category", value: item?.categories?.[0]?.title ?? titleCase(item?.categories?.[0]?.id ?? category) },
      latest?.magnitudeValue
        ? { label: "Magnitude", value: formatMagnitude(latest.magnitudeValue, latest.magnitudeUnit) }
        : { label: "Status", value: "Open event" },
      { label: "Updated", value: fmt(iso(latest?.date)) },
    ],
    tags: uniq([item?.categories?.[0]?.title ?? titleCase(item?.categories?.[0]?.id ?? category), "NASA EONET"]),
  });
}

async function loadFeed<TPayload, TItem>(
  source: EventSourceName,
  loader: () => Promise<TPayload>,
  normalize: (input: TItem) => IntelligenceEvent | null,
  selector: (payload: TPayload) => TItem[],
  detail: (count: number) => string,
  filter?: (event: IntelligenceEvent) => boolean,
): Promise<FeedResult> {
  try {
    const payload = await loader();
    const raw = selector(payload)
      .map(normalize)
      .filter((event): event is IntelligenceEvent => Boolean(event))
      .sort((a, b) => b.severityScore - a.severityScore);
    const events = (filter ? raw.filter(filter) : raw).slice(0, source === "GDACS" ? 30 : source === "USGS" ? 12 : 20);
    return { source, events: events.length ? events : raw.slice(0, 8), ok: true, detail: detail(events.length || raw.slice(0, 8).length), updatedAt: new Date().toISOString() };
  } catch (error) {
    return {
      source,
      events: [],
      ok: false,
      detail: error instanceof Error ? error.message : `${source} unavailable`,
      updatedAt: new Date().toISOString(),
    };
  }
}

function fusionRadius(category: EventCategory) {
  return category === "cyclone" ? 650 : category === "drought" ? 900 : category === "flood" ? 420 : category === "seismic" ? 320 : category === "volcano" ? 180 : category === "wildfire" ? 350 : 260;
}

function fusionWindow(category: EventCategory) {
  return category === "drought" ? 24 * 14 : category === "wildfire" ? 24 * 7 : category === "cyclone" ? 24 * 6 : category === "flood" ? 24 * 5 : category === "seismic" ? 24 : 72;
}

function canFuse(a: IntelligenceEvent, b: IntelligenceEvent) {
  if (a.category !== b.category) return false;
  const close = distKm({ lat: a.location.lat, lon: a.location.lon }, { lat: b.location.lat, lon: b.location.lon }) <= fusionRadius(a.category);
  const timely = hoursBetween(a.startedAt, b.startedAt) <= fusionWindow(a.category);
  return close && timely && (a.location.country === b.location.country || a.location.region === b.location.region);
}

function merge(a: IntelligenceEvent, b: IntelligenceEvent): IntelligenceEvent {
  const lead = a.severityScore >= b.severityScore ? a : b;
  const sources = uniq([...a.sources, ...b.sources]);
  return eventOf({
    ...lead,
    id: uniq([a.id, b.id]).join("__"),
    startedAt: new Date(a.startedAt) <= new Date(b.startedAt) ? a.startedAt : b.startedAt,
    updatedAt: new Date(a.updatedAt) >= new Date(b.updatedAt) ? a.updatedAt : b.updatedAt,
    severityScore: Math.max(a.severityScore, b.severityScore),
    confidenceScore: clamp(Math.max(a.confidenceScore, b.confidenceScore) + (sources.length - 1) * 4, 0, 99),
    sourceCount: sources.length,
    sources,
    sourceIds: uniq([...a.sourceIds, ...b.sourceIds]),
    summary: uniq([lead.summary, a.summary, b.summary]).join(" "),
    likelyImpacts: uniq([...a.likelyImpacts, ...b.likelyImpacts]).slice(0, 4),
    evidence: [...new Map([...a.evidence, ...b.evidence].map((e) => [e.url, e])).values()],
    metrics: [...new Map([...lead.metrics, ...a.metrics, ...b.metrics].map((m) => [m.label, m])).values()].slice(0, 4),
    tags: uniq([...a.tags, ...b.tags]),
  });
}

function fuse(events: IntelligenceEvent[]) {
  const sorted = [...events].sort((a, b) => b.severityScore - a.severityScore || new Date(b.updatedAt).valueOf() - new Date(a.updatedAt).valueOf());
  const merged: IntelligenceEvent[] = [];
  for (const event of sorted) {
    const index = merged.findIndex((candidate) => canFuse(candidate, event));
    if (index === -1) merged.push(event);
    else merged[index] = merge(merged[index], event);
  }
  return merged;
}

function buildMetrics(events: IntelligenceEvent[], rawSignals: number): DashboardMetric[] {
  const high = events.filter((event) => event.severityScore >= 75).length;
  const corroborated = events.filter((event) => event.sourceCount >= 2).length;
  const confidence = events.length ? Math.round(events.reduce((sum, event) => sum + event.confidenceScore, 0) / events.length) : 0;
  const load = Math.round(clamp(events.slice(0, 10).reduce((sum, event) => sum + event.severityScore, 0) / Math.max(1, Math.min(events.length, 10)), 0, 100));
  return [
    { label: "Raw Signals", value: `${rawSignals}`, detail: "live source events ingested this cycle", tone: "neutral" },
    { label: "Fused Events", value: `${events.length}`, detail: "deduplicated global watchpoints on the map", tone: "positive" },
    { label: "Critical Watch", value: `${high}`, detail: "events above the high-risk threshold", tone: high > 3 ? "danger" : "warning" },
    { label: "Fusion Confidence", value: `${confidence}/100`, detail: `${corroborated} events backed by multiple official sources`, tone: confidence >= 88 ? "positive" : "warning" },
    { label: "Disruption Load", value: `${load}/100`, detail: "weighted short-horizon stress across top events", tone: load >= 70 ? "danger" : "warning" },
  ];
}

function buildSectors(events: IntelligenceEvent[]): SectorImpact[] {
  const scores = new Map<string, number>();
  for (const event of events) {
    for (const weight of SECTORS[event.category]) {
      scores.set(weight.sector, (scores.get(weight.sector) ?? 0) + (event.severityScore / 100) * weight.weight);
    }
  }
  return [...scores.entries()]
    .map(([sector, raw]) => ({
      sector,
      score: Math.round(clamp(raw, 0, 100)),
      summary: `${sector} sensitivity is being driven by ${events.filter((event) => SECTORS[event.category].some((weight) => weight.sector === sector)).slice(0, 2).map((event) => event.title).join(" and ") || "current signals"}.`,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function buildRegions(events: IntelligenceEvent[]): RegionalPulse[] {
  const groups = new Map<string, { score: number; events: IntelligenceEvent[] }>();
  for (const event of events) {
    const current = groups.get(event.location.region) ?? { score: 0, events: [] };
    current.score += event.severityScore;
    current.events.push(event);
    groups.set(event.location.region, current);
  }
  return [...groups.entries()]
    .map(([name, payload]) => ({
      region: name,
      score: Math.round(clamp(payload.score / Math.max(1, payload.events.length), 0, 100)),
      activeEvents: payload.events.length,
      summary: `${titleCase(payload.events[0]?.category ?? "risk")} pressure is leading this region, with ${payload.events.slice(0, 2).map((event) => event.location.label).join(" and ")} most exposed.`,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

function buildPredictions(events: IntelligenceEvent[]): PredictionCard[] {
  return events.slice(0, 3).map((event) => ({
    title: event.title,
    confidence: event.predictionSignals[1]?.probability ?? event.confidenceScore,
    horizon: event.predictionSignals[1]?.horizon ?? "72h",
    summary: event.predictionSignals[1]?.summary ?? event.summary,
    drivers: event.likelyImpacts.slice(0, 3),
  }));
}

function buildSourceHealth(feeds: FeedResult[]): SourceHealth[] {
  return feeds.map((feed) => ({
    source: feed.source,
    status: feed.ok ? "live" : "degraded",
    coverage: feed.ok ? `${feed.events.length} surfaced` : "feed degraded",
    detail: feed.detail,
    updatedAt: feed.updatedAt,
  }));
}

export async function getDashboardData(
  options: DashboardBuildOptions = {},
): Promise<DashboardData> {
  const feeds = await Promise.all([
    loadFeed(
      "GDACS",
      () => fetchJson<GdacsPayload>(FEEDS.gdacs),
      normalizeGdacs,
      (payload) => payload.features ?? [],
      (count) => `${count} active disaster signals`,
    ),
    loadFeed(
      "USGS",
      () => fetchJson<UsgsPayload>(FEEDS.usgs),
      normalizeUsgs,
      (payload) => payload.features ?? [],
      (count) => `${count} high-signal seismic events`,
      (event) =>
        event.severityScore >= 62 ||
        event.metrics.some(
          (metric) => metric.label === "Tsunami" && metric.value !== "No tsunami flag",
        ),
    ),
    loadFeed(
      "NASA EONET",
      () => fetchJson<EonetPayload>(FEEDS.eonet),
      normalizeEonet,
      (payload) => payload.events ?? [],
      (count) => `${count} active natural-event tracks`,
    ),
  ]);
  const raw = feeds.flatMap((feed) => feed.events);
  const events = fuse(raw).slice(0, 18);
  const sectors = buildSectors(events);
  const regionalPulses = buildRegions(events);
  const predictions = buildPredictions(events);
  const metrics = buildMetrics(events, raw.length);
  const sourceHealth = buildSourceHealth(feeds);
  const generatedAt = new Date().toISOString();
  const baseData: DashboardData = {
    generatedAt,
    overview: events.length
      ? `Cross-source fusion is tracking ${events.length} live watchpoints, with the sharpest pressure in ${regionalPulses[0]?.region ?? "global corridors"} and the largest projected spillover into ${(sectors[0]?.sector ?? "Supply Chain").toLowerCase()}.`
      : "Live feeds are connected, but no events cleared the current intelligence thresholds. The platform is ready to ingest and fuse new signals as they arrive.",
    headline: events.length ? `${titleCase(events[0].severityLabel)} priority: ${events[0].title} near ${events[0].location.label}` : "No major fused watchpoints are active right now.",
    narrativeProvider: "heuristic",
    rawSignalCount: raw.length,
    metrics,
    sourceHealth,
    insights: events.slice(0, 5).map((event) => event.insight),
    events,
    sectors,
    regionalPulses,
    predictions,
  };

  if (options.narrativeMode === "gemini") {
    return enhanceDashboardWithGemini(baseData);
  }

  return baseData;
}
