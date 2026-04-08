# Global Situation Intelligence Dashboard

A single-page AI dashboard that fuses live global risk signals into one map, one insight stream, and one lightweight scenario engine.

## What this MVP already does

- Ingests live official feeds from GDACS, USGS, and NASA EONET
- Normalizes them into one shared `IntelligenceEvent` model
- Deduplicates nearby events across sources into fused watchpoints
- Generates one-line AI-style insights
- Projects short-horizon impact scenarios
- Shows the result on a global map with sector and regional risk views

## Run it locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Gemini 2.5 Flash setup

If you want the dashboard to use Gemini for faster narrative rewriting:

1. Copy `.env.example` to `.env.local`
2. Set `GEMINI_API_KEY`
3. Keep `GEMINI_MODEL=gemini-2.5-flash` unless you want to override it

How it works:

- The first paint uses the built-in heuristic narrative layer for speed.
- After mount, the client refreshes in the background and upgrades the headline and insights through Gemini when your key is present.
- If Gemini times out or the key is missing, the dashboard falls back automatically.

## Architecture

- `src/lib/intelligence.ts`
  The live intelligence engine. Fetches feeds, normalizes events, fuses overlapping signals, scores severity, and creates prediction cards.
- `src/app/api/intelligence/route.ts`
  JSON API route for client refresh and future integrations.
- `src/components/dashboard-shell.tsx`
  Main dashboard UI with polling, filtering, map, insights, and scenario cards.
- `src/components/world-map.tsx`
  SVG world map rendered with `d3-geo` and `world-atlas`.

## Live data sources

- GDACS: global disaster awareness and coordination signals
- USGS: earthquake details and seismic significance
- NASA EONET: active natural event monitoring

## How to turn this into a stronger product

1. Add premium world news and conflict feeds, then build multilingual article clustering.
2. Replace heuristic impact scoring with causal graphs and calibrated probability outputs.
3. Add user exposure graphs for suppliers, ports, factories, offices, and watchlists.
4. Track event revisions over time and generate change-aware summaries instead of full rewrites.
5. Add scenario branching such as port closure duration, conflict escalation, or storm path shift.

## Patent-oriented directions

The UI itself is not enough for defensibility. The more promising invention layer is:

- streaming evidence fusion into a continuously updated event object
- contradiction handling across noisy sources
- exposure-conditioned forecasting based on a user asset graph
- second-order ripple prediction across sectors and regions

That technical pipeline is what should later be documented, benchmarked, and discussed with patent counsel.
