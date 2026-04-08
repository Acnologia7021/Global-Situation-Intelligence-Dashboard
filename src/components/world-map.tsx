"use client";

import countriesAtlas from "world-atlas/countries-110m.json";
import { geoEqualEarth, geoPath } from "d3-geo";
import { feature as topojsonFeature } from "topojson-client";

import type { IntelligenceEvent } from "@/lib/types";

type WorldMapProps = {
  events: IntelligenceEvent[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
};

const atlas = countriesAtlas as { objects: { countries: unknown } };
const worldFeatures = (
  topojsonFeature(atlas as never, atlas.objects.countries as never) as unknown as {
    features: Array<{ id?: string | number; geometry: never }>;
  }
).features;

const radius = (score: number) => (score >= 85 ? 9 : score >= 70 ? 7 : score >= 50 ? 5.5 : 4);
const tone = (score: number) =>
  score >= 85 ? "#fa5252" : score >= 70 ? "#f08c00" : score >= 50 ? "#fab005" : "#4dabf7";

export function WorldMap({ events, onSelectEvent, selectedEventId }: WorldMapProps) {
  const projection = geoEqualEarth().fitExtent(
    [
      [12, 12],
      [888, 438],
    ],
    { type: "Sphere" } as never,
  );
  const path = geoPath(projection);

  return (
    <svg viewBox="0 0 900 450" aria-label="Global situation intelligence map">
      <defs>
        <radialGradient id="map-glow" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="rgba(50, 86, 125, 0.18)" />
          <stop offset="100%" stopColor="rgba(9, 18, 33, 0)" />
        </radialGradient>
      </defs>

      <rect x="0" y="0" width="900" height="450" rx="28" fill="url(#map-glow)" />

      {worldFeatures.map((shape, index) => (
        <path
          key={`${shape.id ?? `shape-${index}`}`}
          d={path(shape as never) ?? ""}
          fill="#11263b"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={0.8}
        />
      ))}

      {events.map((event) => {
        const projected = projection([event.location.lon, event.location.lat]);
        if (!projected) return null;

        const [x, y] = projected;
        const markerSize = radius(event.severityScore);
        const markerColor = tone(event.severityScore);
        const selected = event.id === selectedEventId;

        return (
          <g
            key={event.id}
            aria-label={`${event.title} near ${event.location.label}`}
            role="button"
            tabIndex={0}
            transform={`translate(${x}, ${y})`}
            onClick={() => onSelectEvent(event.id)}
            onKeyDown={(keyboardEvent) => {
              if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                keyboardEvent.preventDefault();
                onSelectEvent(event.id);
              }
            }}
          >
            {selected ? (
              <circle
                r={markerSize + 9}
                fill="none"
                stroke={markerColor}
                strokeOpacity="0.28"
                strokeWidth="2"
              />
            ) : null}
            <circle r={markerSize + 2} fill={markerColor} fillOpacity={selected ? 0.32 : 0.18} />
            <circle r={markerSize} fill={markerColor} stroke="#fff5" strokeWidth="1.2" />
            <circle r="1.6" fill="#ffffff" />
          </g>
        );
      })}
    </svg>
  );
}
