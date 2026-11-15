"use client";

import { useEffect, useState } from "react";

/** Fixed epoch so server and client render the same first frame (Sat 14 Nov 2026 18:00 UTC). */
export const MOCK_EPOCH = 1_794_765_600;

/** A 1s mock clock for /system until `useNow` lands. */
export function useMockClock(start = MOCK_EPOCH): [number, (n: number) => void] {
  const [now, setNow] = useState(start);
  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return [now, setNow];
}
