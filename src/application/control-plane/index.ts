import { isDemoMode } from "@/lib/env";

export async function getControlPlane() {
  if (isDemoMode()) return (await import("./demo-store")).demoControlPlane;
  return (await import("./postgres-store")).postgresControlPlane;
}
