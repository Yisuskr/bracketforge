"use client";

import { useRef, useState } from "react";

type Player = { seed: number; name: string; score?: number; winner?: boolean };
type Match = { id: string; status: "completed" | "live" | "ready"; players: [Player, Player] };

const rounds: { label: string; shortLabel: string; matches: Match[] }[] = [
  { label: "Cuartos de final", shortLabel: "Ronda 01", matches: [
    { id: "M01", status: "completed", players: [{ seed: 1, name: "Lina Vega", score: 2, winner: true }, { seed: 8, name: "Álex Mora", score: 0 }] },
    { id: "M02", status: "completed", players: [{ seed: 4, name: "Noah Silva", score: 2, winner: true }, { seed: 5, name: "Iris León", score: 1 }] },
    { id: "M03", status: "completed", players: [{ seed: 2, name: "Leo Cruz", score: 2, winner: true }, { seed: 7, name: "Dani Ríos", score: 0 }] },
    { id: "M04", status: "completed", players: [{ seed: 3, name: "Mara Sol", score: 1 }, { seed: 6, name: "Kai Vidal", score: 2, winner: true }] },
  ]},
  { label: "Semifinales", shortLabel: "Ronda 02", matches: [
    { id: "M05", status: "live", players: [{ seed: 1, name: "Lina Vega", score: 1 }, { seed: 4, name: "Noah Silva", score: 1 }] },
    { id: "M06", status: "ready", players: [{ seed: 2, name: "Leo Cruz" }, { seed: 6, name: "Kai Vidal" }] },
  ]},
  { label: "Gran final", shortLabel: "Ronda 03", matches: [
    { id: "M07", status: "ready", players: [{ seed: 0, name: "Por decidir" }, { seed: 0, name: "Por decidir" }] },
  ]},
];

function TrophyIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0V4Zm0 2H5v2a3 3 0 0 0 3 3m8-5h3v2a3 3 0 0 1-3 3M12 13v4m-3 3h6" /></svg>;
}

export function DemoBracket({ compact = false }: { compact?: boolean }) {
  const [zoom, setZoom] = useState(compact ? 0.72 : 1);
  const viewportRef = useRef<HTMLDivElement>(null);

  async function toggleFullscreen() {
    if (!document.fullscreenElement) await viewportRef.current?.requestFullscreen();
    else await document.exitFullscreen();
  }

  return (
    <div className={`bracket-module ${compact ? "is-compact" : ""}`}>
      {!compact && <div className="bracket-toolbar" aria-label="Controles del bracket">
        <div className="bracket-tabs" role="tablist" aria-label="Vistas del torneo">
          <button className="active" role="tab" aria-selected="true">Bracket principal</button>
          <button role="tab" aria-selected="false" disabled>Clasificación</button>
        </div>
        <div className="view-controls">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.7, value - 0.1))} aria-label="Alejar">−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(1.2, value + 0.1))} aria-label="Acercar">+</button>
          <button type="button" onClick={toggleFullscreen} aria-label="Pantalla completa" className="fullscreen-control">⛶</button>
        </div>
      </div>}
      <div className="bracket-viewport" ref={viewportRef}>
        <div className="bracket-grid" style={{ transform: `scale(${zoom})` }}>
          {rounds.map((round, roundIndex) => <section className={`bracket-round bracket-round-${roundIndex + 1}`} key={round.label} aria-label={round.label}>
            <header className="round-heading"><span>{round.shortLabel}</span><h3>{round.label}</h3><small>{round.matches.length} {round.matches.length === 1 ? "partido" : "partidos"}</small></header>
            <div className="round-matches">{round.matches.map((match) => <article className={`match-card is-${match.status}`} key={match.id} tabIndex={0}>
              <header><span>{match.id}</span><span className="match-state"><i aria-hidden="true" />{match.status === "completed" ? "Finalizado" : match.status === "live" ? "En juego" : "Preparado"}</span></header>
              <div className="players">{match.players.map((player, playerIndex) => <div className={`player ${player.winner ? "is-winner" : ""} ${player.seed === 0 ? "is-pending" : ""}`} key={`${match.id}-${playerIndex}`}>
                <span className="seed">{player.seed || "?"}</span><span className="avatar" aria-hidden="true">{player.seed ? player.name.slice(0, 2).toUpperCase() : "—"}</span><strong>{player.name}</strong>{player.winner && <span className="winner-mark" title="Ganador">✓</span>}<b>{player.score ?? "—"}</b>
              </div>)}</div>
            </article>)}</div>
          </section>)}
          <aside className="champion-card" aria-label="Campeón pendiente"><div className="trophy"><TrophyIcon /></div><span>Campeón</span><strong>¿Quién dominará<br />la arena?</strong><small>La final está esperando</small></aside>
        </div>
      </div>
    </div>
  );
}
