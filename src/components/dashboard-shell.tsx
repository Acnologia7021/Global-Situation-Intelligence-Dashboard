"use client";

import {
  AlertTriangle,
  Globe2,
  Layers3,
  Radar,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { startTransition, useDeferredValue, useEffect, useEffectEvent, useState } from "react";

import type { DashboardData, EventCategory, SeverityLabel } from "@/lib/types";

import styles from "./dashboard-shell.module.css";
import { WorldMap } from "./world-map";

type DashboardShellProps = {
  initialData: DashboardData;
};

const CATEGORY_FILTERS: Array<{ label: string; value: EventCategory | "all" }> = [
  { label: "All", value: "all" },
  { label: "Seismic", value: "seismic" },
  { label: "Cyclone", value: "cyclone" },
  { label: "Flood", value: "flood" },
  { label: "Wildfire", value: "wildfire" },
  { label: "Drought", value: "drought" },
  { label: "Volcano", value: "volcano" },
  { label: "Weather", value: "weather" },
];

const innovationCards = [
  {
    icon: Layers3,
    title: "Evidence Fusion Layer",
    summary:
      "Normalize noisy feeds into one event object with confidence, source provenance, and change history.",
  },
  {
    icon: Radar,
    title: "Ripple-Effect Forecasting",
    summary:
      "Predict second-order impacts across logistics, energy, humanitarian response, and food systems.",
  },
  {
    icon: ShieldCheck,
    title: "Exposure-Aware Intelligence",
    summary:
      "Next patent-oriented layer: score event impacts against uploaded factories, suppliers, ports, or portfolios.",
  },
];

function severityClass(severityLabel: SeverityLabel) {
  switch (severityLabel) {
    case "critical":
      return styles.pillCritical;
    case "high":
      return styles.pillHigh;
    case "moderate":
      return styles.pillModerate;
    default:
      return styles.pillWatch;
  }
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function DashboardShell({ initialData }: DashboardShellProps) {
  const [data, setData] = useState(initialData);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    initialData.events[0]?.id ?? null,
  );
  const [activeFilter, setActiveFilter] = useState<EventCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const shouldBootstrapEnhancement = initialData.narrativeProvider === "heuristic";

  async function refreshDashboard(backgroundRefresh: boolean) {
    if (!backgroundRefresh) {
      setIsRefreshing(true);
    }

    try {
      const response = await fetch("/api/intelligence", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`Refresh failed with ${response.status}`);
      }

      const nextData = (await response.json()) as DashboardData;
      startTransition(() => {
        setData(nextData);
        setRefreshError(null);

        if (!nextData.events.some((event) => event.id === selectedEventId)) {
          setSelectedEventId(nextData.events[0]?.id ?? null);
        }
      });
    } catch (error) {
      setRefreshError(
        error instanceof Error ? error.message : "The dashboard could not refresh right now.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  const refreshFromEffect = useEffectEvent(() => {
    void refreshDashboard(true);
  });

  useEffect(() => {
    if (shouldBootstrapEnhancement) {
      refreshFromEffect();
    }

    const intervalId = window.setInterval(() => {
      refreshFromEffect();
    }, 300_000);

    return () => window.clearInterval(intervalId);
  }, [shouldBootstrapEnhancement]);

  useEffect(() => {
    if (!data.events.length) {
      return;
    }

    if (!selectedEventId) {
      setSelectedEventId(data.events[0].id);
    }
  }, [data.events, selectedEventId]);

  const filteredEvents = data.events.filter((event) => {
    const matchesFilter = activeFilter === "all" || event.category === activeFilter;
    const haystack =
      `${event.title} ${event.location.label} ${event.location.region} ${event.summary} ${event.tags.join(" ")}`.toLowerCase();
    const matchesQuery = !deferredQuery || haystack.includes(deferredQuery);
    return matchesFilter && matchesQuery;
  });

  const selectedEvent =
    filteredEvents.find((event) => event.id === selectedEventId) ??
    data.events.find((event) => event.id === selectedEventId) ??
    filteredEvents[0] ??
    data.events[0] ??
    null;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.masthead}>
          <div className={styles.brandBlock}>
            <div className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              Global Situation Intelligence Dashboard
            </div>
            <h1>One world map. One fused intelligence layer.</h1>
            <p>
              {data.overview} This MVP already merges official feeds into one event stream, writes
              one-line insights, and surfaces short-horizon impact scenarios for a stronger v2
              forecasting engine.
            </p>
            <p>Response layer: {data.narrativeProvider}</p>
          </div>

          <div className={styles.controls}>
            <button
              type="button"
              className={styles.refreshButton}
              disabled={isRefreshing}
              onClick={() => {
                void refreshDashboard(false);
              }}
            >
              <RefreshCcw className={isRefreshing ? styles.spin : ""} size={16} />
              {isRefreshing ? "Refreshing live signals..." : "Refresh intelligence"}
            </button>
          </div>
        </header>

        {refreshError ? <div className={styles.errorBanner}>{refreshError}</div> : null}

        <section className={styles.hero}>
          <div className={styles.heroPanel}>
            <div className={styles.heroGrid}>
              <div className={styles.headline}>
                <div className={styles.eyebrow}>Live situation pulse</div>
                <h2>{data.headline}</h2>
                <p>
                  The current engine fuses GDACS, USGS, and NASA EONET. The next step toward a
                  patent-level system is replacing heuristic scoring with causal event graphs,
                  asset exposure models, and user-specific scenario branching.
                </p>
              </div>

              <div className={styles.capabilityRow}>
                <span className={styles.capabilityChip}>AI one-line event summaries</span>
                <span className={styles.capabilityChip}>Cross-source event fusion</span>
                <span className={styles.capabilityChip}>Map-based global watchpoints</span>
                <span className={styles.capabilityChip}>Short-horizon impact scenarios</span>
              </div>
            </div>
          </div>

          <aside className={styles.floatingPanel}>
            <div className={styles.floatingLabel}>Now Watching</div>
            <h3>{selectedEvent?.title ?? "Waiting for new signals"}</h3>
            <p>
              {selectedEvent?.insight ??
                "The dashboard is connected and ready to surface new fused watchpoints as feeds update."}
            </p>
            <div className={styles.pillRow}>
              <span className={`${styles.pill} ${severityClass(selectedEvent?.severityLabel ?? "watch")}`}>
                <AlertTriangle size={14} />
                {selectedEvent ? selectedEvent.severityLabel.toUpperCase() : "WATCH"}
              </span>
              <span className={styles.pill}>
                <Globe2 size={14} />
                {selectedEvent?.location.region ?? "Global"}
              </span>
              <span className={styles.pill}>
                <ShieldCheck size={14} />
                {selectedEvent?.confidenceLabel ?? "official signal"}
              </span>
            </div>
            <div className={styles.timestamp}>Updated {formatTime(data.generatedAt)}</div>
          </aside>
        </section>

        <section className={styles.metricsGrid}>
          {data.metrics.map((metric) => (
            <article
              key={metric.label}
              className={`${styles.metricCard} ${
                metric.tone === "danger"
                  ? styles.metricToneDanger
                  : metric.tone === "positive"
                    ? styles.metricTonePositive
                    : metric.tone === "warning"
                      ? styles.metricToneWarning
                      : ""
              }`}
            >
              <div className={styles.metricLabel}>{metric.label}</div>
              <div className={styles.metricValue}>{metric.value}</div>
              <p className={styles.metricDetail}>{metric.detail}</p>
            </article>
          ))}
        </section>

        <section className={`${styles.sectionPanel} ${styles.insightsPanel}`}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>AI One-Line Insight Stream</h3>
              <p>
                Compressed summaries you could later replace with a fine-tuned or LLM-backed
                narrative layer.
              </p>
            </div>
            <Sparkles size={18} color="#1c7ed6" />
          </div>
          <div className={styles.insightList}>
            {data.insights.map((insightItem) => (
              <div key={insightItem} className={styles.insightItem}>
                <span className={styles.insightBullet} />
                <span>{insightItem}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.contentGrid}>
          <div className={styles.sectionPanel}>
            <div className={styles.sectionHeader}>
              <div>
                <h3>Global Watch Map</h3>
                <p>Each marker is a fused event object built from official source signals.</p>
              </div>
              <Radar size={18} color="#1098ad" />
            </div>

            <div className={styles.mapFrame}>
              <WorldMap
                events={filteredEvents.length ? filteredEvents : data.events}
                selectedEventId={selectedEvent?.id ?? null}
                onSelectEvent={setSelectedEventId}
              />

              <div className={styles.mapLegend}>
                <span className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: "#4dabf7" }} />
                  Watch
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: "#fab005" }} />
                  Moderate
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: "#f08c00" }} />
                  High
                </span>
                <span className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: "#fa5252" }} />
                  Critical
                </span>
              </div>

              {selectedEvent ? (
                <article className={styles.selectedCard}>
                  <div className={styles.selectedTopline}>
                    <h4>{selectedEvent.title}</h4>
                    <div className={styles.pillRow}>
                      <span className={`${styles.pill} ${severityClass(selectedEvent.severityLabel)}`}>
                        {selectedEvent.severityLabel.toUpperCase()}
                      </span>
                      <span className={styles.pill}>{selectedEvent.location.label}</span>
                    </div>
                  </div>

                  <p className={styles.selectedSummary}>{selectedEvent.summary}</p>

                  <div className={styles.factGrid}>
                    {selectedEvent.metrics.map((metric) => (
                      <div key={metric.label} className={styles.fact}>
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                      </div>
                    ))}
                  </div>

                  <div className={styles.impactList}>
                    {selectedEvent.likelyImpacts.map((impact) => (
                      <span key={impact} className={styles.impactItem}>
                        {impact}
                      </span>
                    ))}
                  </div>
                </article>
              ) : (
                <div className={styles.emptyState}>
                  No event is selected yet. As new signals arrive, this panel will surface the fused
                  event summary, confidence, and likely impact trail.
                </div>
              )}
            </div>
          </div>

          <aside className={styles.feedPanel}>
            <div className={styles.sectionHeader}>
              <div>
                <h3>Live Event Queue</h3>
                <p>Search and filter the fused event stream.</p>
              </div>
              <Zap size={18} color="#e67700" />
            </div>

            <div className={styles.filterRow}>
              <input
                className={styles.searchInput}
                placeholder="Search location, event, region, or impact"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <div className={styles.chipScroller}>
              {CATEGORY_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={`${styles.filterChip} ${
                    activeFilter === filter.value ? styles.filterChipActive : ""
                  }`}
                  onClick={() => setActiveFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className={styles.feedList}>
              {filteredEvents.length ? (
                filteredEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className={`${styles.feedItem} ${
                      selectedEvent?.id === event.id ? styles.feedItemActive : ""
                    }`}
                    onClick={() => setSelectedEventId(event.id)}
                  >
                    <div className={styles.feedItemTitle}>
                      <h4>{event.title}</h4>
                      <span className={`${styles.pill} ${severityClass(event.severityLabel)}`}>
                        {event.severityLabel}
                      </span>
                    </div>

                    <div className={styles.feedItemMeta}>
                      <span>{event.location.label}</span>
                      <span>{event.sources.join(" + ")}</span>
                      <span>{formatTime(event.updatedAt)}</span>
                    </div>

                    <p className={styles.feedItemSummary}>{event.insight}</p>
                  </button>
                ))
              ) : (
                <div className={styles.emptyState}>
                  No events match the current filter. Clear the search or switch categories to view
                  the full fusion stream.
                </div>
              )}
            </div>
          </aside>
        </section>

        <section className={styles.sectionGrid}>
          <div className={styles.sectionPanel}>
            <div className={styles.sectionHeader}>
              <div>
                <h3>Scenario Engine</h3>
                <p>
                  Heuristic v1 forecasts that can later be upgraded into causal ML or graph models.
                </p>
              </div>
              <Sparkles size={18} color="#0ca678" />
            </div>
            <div className={styles.predictionGrid}>
              {data.predictions.map((prediction) => (
                <article key={prediction.title} className={styles.predictionCard}>
                  <div className={styles.predictionTopline}>
                    <h4>{prediction.title}</h4>
                    <span className={styles.scoreBadge}>
                      {prediction.horizon} | {prediction.confidence}%
                    </span>
                  </div>
                  <p>{prediction.summary}</p>
                  <div className={styles.driverRow}>
                    {prediction.drivers.map((driver) => (
                      <span key={driver} className={styles.driver}>
                        {driver}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.sectionPanel}>
            <div className={styles.sectionHeader}>
              <div>
                <h3>Sector Stress Model</h3>
                <p>Weighted exposure by sector, derived from fused event categories and severity.</p>
              </div>
              <Layers3 size={18} color="#1c7ed6" />
            </div>
            <div className={styles.sectorGrid}>
              {data.sectors.map((sector) => (
                <article key={sector.sector} className={styles.sectorCard}>
                  <div className={styles.scoreLine}>
                    <h4>{sector.sector}</h4>
                    <span className={styles.scoreBadge}>{sector.score}/100</span>
                  </div>
                  <p>{sector.summary}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.sectionGrid}>
          <div className={styles.sectionPanel}>
            <div className={styles.sectionHeader}>
              <div>
                <h3>Regional Pressure</h3>
                <p>Macro regions ranked by current average event intensity.</p>
              </div>
              <Globe2 size={18} color="#1098ad" />
            </div>
            <div className={styles.regionGrid}>
              {data.regionalPulses.map((pulse) => (
                <article key={pulse.region} className={styles.regionCard}>
                  <div className={styles.scoreLine}>
                    <h4>{pulse.region}</h4>
                    <span className={styles.scoreBadge}>
                      {pulse.activeEvents} events | {pulse.score}/100
                    </span>
                  </div>
                  <p>{pulse.summary}</p>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.sectionPanel}>
            <div className={styles.sectionHeader}>
              <div>
                <h3>Patent-Oriented Next Layer</h3>
                <p>These are the defensible product modules to build after the MVP dashboard.</p>
              </div>
              <ShieldCheck size={18} color="#0ca678" />
            </div>
            <div className={styles.innovationGrid}>
              {innovationCards.map((card) => {
                const Icon = card.icon;
                return (
                  <article key={card.title} className={styles.innovationCard}>
                    <div className={styles.scoreLine}>
                      <h4>{card.title}</h4>
                      <Icon size={18} color="#1d3557" />
                    </div>
                    <p>{card.summary}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className={styles.sourcePanel}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Source Health</h3>
              <p>
                The current build is connected to official public feeds and ready for premium-source
                expansion.
              </p>
            </div>
          </div>
          <div className={styles.sourceGrid}>
            {data.sourceHealth.map((source) => (
              <article key={source.source} className={styles.sourceCard}>
                <div className={styles.scoreLine}>
                  <h4>{source.source}</h4>
                  <span
                    className={
                      source.status === "live" ? styles.sourceStatusLive : styles.sourceStatusDegraded
                    }
                  >
                    {source.status.toUpperCase()}
                  </span>
                </div>
                <p>{source.coverage}</p>
                <div className={styles.inlineNote}>{source.detail}</div>
                <div className={styles.inlineNote}>Checked {formatTime(source.updatedAt)}</div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
