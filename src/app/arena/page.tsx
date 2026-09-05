import Link from "next/link";
import { BracketPreview } from "@/components/bracket-preview";
import { SiteHeader } from "@/components/site-header";
import { ShareButton } from "@/components/share-button";

export default function ArenaPreview() {
  return (
    <>
      <SiteHeader />
      <main className="showcase-page">
        <section className="tournament-hero container">
          <div className="tournament-identity">
            <div className="event-emblem" aria-hidden="true">
              CF
            </div>
            <div>
              <p className="eyebrow">Arena publica de ejemplo</p>
              <h1>Copa de la Comunidad</h1>
              <p className="tournament-meta">
                <span>Eliminacion simple</span>
                <i />
                8 competidores
                <i />
                Mejor de 3
              </p>
            </div>
          </div>
          <div className="tournament-actions">
            <span className="live-badge">
              <i /> En directo
            </span>
            <ShareButton />
          </div>
        </section>

        <section
          className="arena-status container"
          aria-label="Estado del torneo"
        >
          <div>
            <span>Partidos</span>
            <strong>
              4 <small>/ 7</small>
            </strong>
          </div>
          <div>
            <span>Competidores</span>
            <strong>8</strong>
          </div>
          <div>
            <span>Ronda actual</span>
            <strong>Semifinales</strong>
          </div>
          <div className="status-progress">
            <span>
              Progreso del torneo <b>57%</b>
            </span>
            <div>
              <i />
            </div>
          </div>
        </section>

        <section className="bracket-shell container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">El camino a la victoria</p>
              <h2>Bracket principal</h2>
            </div>
            <p>
              <span className="pulse-dot" /> Actualizado hace unos segundos
            </p>
          </div>
          <BracketPreview />
        </section>

        <section className="showcase-cta container">
          <div>
            <span>Preparado para competir</span>
            <h2>Crea tu propia arena.</h2>
          </div>
          <Link href="/tournaments/new" className="button large">
            Crear torneo gratis <span>→</span>
          </Link>
        </section>
      </main>
    </>
  );
}
