"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const activeStatuses = new Set(["QUEUED", "RUNNING", "WAITING_FOR_APPROVAL"]);

export function RunStatusPoller({ status }: { status: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!activeStatuses.has(status)) return;
    const timer = window.setInterval(() => router.refresh(), 1_500);
    return () => window.clearInterval(timer);
  }, [router, status]);
  return null;
}
