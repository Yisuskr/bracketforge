"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type LiveStatus = "connecting" | "live" | "offline";

const hasSupabaseConfig = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

const statusLabels: Record<LiveStatus, string> = {
  connecting: "Conectando",
  live: "En vivo",
  offline: "Sin directo",
};

type LiveTournamentRefreshProps = {
  tournamentId: string;
};

export function LiveTournamentRefresh({
  tournamentId,
}: LiveTournamentRefreshProps) {
  const router = useRouter();
  const [status, setStatus] = useState<LiveStatus>(
    hasSupabaseConfig ? "connecting" : "offline",
  );
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!hasSupabaseConfig) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    let mounted = true;

    const refreshSoon = () => {
      if (refreshTimer.current) {
        window.clearTimeout(refreshTimer.current);
      }

      refreshTimer.current = window.setTimeout(() => {
        router.refresh();
      }, 350);
    };

    const channel = supabase
      .channel(`tournament:${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `id=eq.${tournamentId}`,
          schema: "public",
          table: "tournaments",
        },
        refreshSoon,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `tournament_id=eq.${tournamentId}`,
          schema: "public",
          table: "participants",
        },
        refreshSoon,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `tournament_id=eq.${tournamentId}`,
          schema: "public",
          table: "rounds",
        },
        refreshSoon,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `tournament_id=eq.${tournamentId}`,
          schema: "public",
          table: "matches",
        },
        refreshSoon,
      )
      .subscribe((connectionStatus) => {
        if (!mounted) return;

        if (connectionStatus === "SUBSCRIBED") {
          setStatus("live");
          return;
        }

        if (
          connectionStatus === "CHANNEL_ERROR" ||
          connectionStatus === "TIMED_OUT" ||
          connectionStatus === "CLOSED"
        ) {
          setStatus("offline");
        }
      });

    return () => {
      mounted = false;

      if (refreshTimer.current) {
        window.clearTimeout(refreshTimer.current);
      }

      void supabase.removeChannel(channel);
    };
  }, [router, tournamentId]);

  return (
    <span className={`live-sync-pill is-${status}`} aria-live="polite">
      <span aria-hidden="true" />
      {statusLabels[status]}
    </span>
  );
}
