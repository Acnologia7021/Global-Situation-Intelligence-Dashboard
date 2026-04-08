import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardData } from "@/lib/intelligence";

export default async function Home() {
  const data = await getDashboardData({ narrativeMode: "heuristic" });

  return <DashboardShell initialData={data} />;
}
