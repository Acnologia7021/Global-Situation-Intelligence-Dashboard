export type EventCategory =
  | "seismic"
  | "cyclone"
  | "flood"
  | "wildfire"
  | "drought"
  | "volcano"
  | "weather";

export type EventSourceName = "GDACS" | "USGS" | "NASA EONET";

export type SeverityLabel = "watch" | "moderate" | "high" | "critical";

export type EventStatus = "active" | "evolving" | "monitoring";

export type EventEvidence = {
  source: EventSourceName;
  label: string;
  url: string;
};

export type EventMetric = {
  label: string;
  value: string;
};

export type PredictionSignal = {
  horizon: "24h" | "72h" | "7d";
  probability: number;
  summary: string;
};

export type IntelligenceEvent = {
  id: string;
  title: string;
  category: EventCategory;
  subcategory: string;
  status: EventStatus;
  location: {
    lat: number;
    lon: number;
    label: string;
    country: string;
    region: string;
  };
  startedAt: string;
  updatedAt: string;
  severityScore: number;
  severityLabel: SeverityLabel;
  confidenceScore: number;
  confidenceLabel: string;
  sourceCount: number;
  sources: EventSourceName[];
  sourceIds: string[];
  summary: string;
  insight: string;
  likelyImpacts: string[];
  predictionSignals: PredictionSignal[];
  evidence: EventEvidence[];
  metrics: EventMetric[];
  tags: string[];
};

export type DashboardMetric = {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "positive" | "warning" | "danger";
};

export type SourceHealth = {
  source: EventSourceName;
  status: "live" | "degraded";
  coverage: string;
  detail: string;
  updatedAt: string;
};

export type SectorImpact = {
  sector: string;
  score: number;
  summary: string;
};

export type RegionalPulse = {
  region: string;
  score: number;
  activeEvents: number;
  summary: string;
};

export type PredictionCard = {
  title: string;
  confidence: number;
  horizon: string;
  summary: string;
  drivers: string[];
};

export type DashboardData = {
  generatedAt: string;
  overview: string;
  headline: string;
  narrativeProvider: string;
  rawSignalCount: number;
  metrics: DashboardMetric[];
  sourceHealth: SourceHealth[];
  insights: string[];
  events: IntelligenceEvent[];
  sectors: SectorImpact[];
  regionalPulses: RegionalPulse[];
  predictions: PredictionCard[];
};
