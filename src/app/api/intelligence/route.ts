import { getDashboardData } from "@/lib/intelligence";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const narrativeMode =
    searchParams.get("narrative") === "heuristic" ? "heuristic" : "gemini";
  const data = await getDashboardData({ narrativeMode });

  return Response.json(data, {
    headers: {
      "Cache-Control": "no-store",
      "X-Narrative-Provider": data.narrativeProvider,
    },
  });
}
