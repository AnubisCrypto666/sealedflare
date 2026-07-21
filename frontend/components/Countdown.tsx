"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

function formatRemaining(seconds: number, expiredLabel: string): string {
  if (seconds <= 0) return expiredLabel;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (d > 0 || h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`, `${s}s`);
  return `${parts.join(" ")} left`;
}

export function Countdown({
  deadline,
  expiredLabel = "Bidding closed",
  live = false,
}: {
  deadline: number;
  expiredLabel?: string;
  // live renders the pulsing dot + pink glow for the running bidding
  // countdown; omitted/false keeps the plain text used elsewhere (e.g. the
  // amber settlement-window countdown).
  live?: boolean;
}) {
  // Avoid hydration mismatch: the server always renders the placeholder,
  // while the client starts ticking after mount.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  if (!mounted) {
    return <span className="tabular-nums">&mdash;</span>;
  }

  if (live) {
    return (
      <span className="inline-flex items-center text-[#F73C68] drop-shadow-[0_0_14px_rgba(230,32,88,0.45)]">
        <span className="relative mr-1.5 inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E62058] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#F73C68]" />
        </span>
        <span className="tabular-nums">
          {formatRemaining(deadline - now, expiredLabel)}
        </span>
      </span>
    );
  }

  return (
    <span className="tabular-nums">
      {formatRemaining(deadline - now, expiredLabel)}
    </span>
  );
}
