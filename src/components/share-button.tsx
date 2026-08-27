"use client";

import { useState } from "react";

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  async function share() {
    const data = { title: "Copa de la Comunidad · BracketForge", url: window.location.href };
    if (navigator.share) await navigator.share(data);
    else {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  return <button className="icon-button" type="button" onClick={share} aria-label="Compartir torneo">↗ <span>{copied ? "Enlace copiado" : "Compartir"}</span></button>;
}
