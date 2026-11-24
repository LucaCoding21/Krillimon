"use client";

// Pokémon battle sprites (Pokémon Showdown / Smogon Sprite Project) and Poké Ball
// item art. Animated sprites come from PokéAPI's mirror of the Showdown set, with
// Showdown's own Gen 5-style sprites as a fallback for the newest Pokémon and
// PokéAPI's static sprites as a last resort.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { TierId } from "@/lib/game";

const PA = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites";
const SD = "https://play.pokemonshowdown.com/sprites";

// No animated sprite in PokéAPI's Showdown mirror yet (newer Gen 9 Pokémon).
const NO_ANIM = new Set([990, 991, 992, 993, 994, 995, 1006, 1008, 1010, 1017, 1022, 1023, 1024, 1025]);

const showdownId = (name: string) =>
  name.replace(/♀/g, "f").replace(/♂/g, "m").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export type View = "front" | "back";

export function spriteCandidates(id: number, name: string, view: View = "front", shiny = false) {
  const back = view === "back";
  const urls: string[] = [];
  if (!NO_ANIM.has(id)) urls.push(`${PA}/pokemon/other/showdown/${back ? "back/" : ""}${shiny ? "shiny/" : ""}${id}.gif`);
  urls.push(`${SD}/gen5${back ? "-back" : ""}${shiny ? "-shiny" : ""}/${showdownId(name)}.png`);
  urls.push(`${PA}/pokemon/${back ? "back/" : ""}${shiny ? "shiny/" : ""}${id}.png`);
  return urls;
}

/** An animated battle sprite, scaled up with crisp pixels and anchored at its feet. */
export function Sprite({ id, name, view = "front", shiny = false, scale = 2, className, style }: {
  id: number; name: string; view?: View; shiny?: boolean; scale?: number; className?: string; style?: CSSProperties;
}) {
  const urls = spriteCandidates(id, name, view, shiny);
  const key = urls[0];
  const [failed, setFailed] = useState({ key: "", index: 0 });
  const index = failed.key === key ? failed.index : 0;
  const ref = useRef<HTMLImageElement>(null);
  const tryNext = () => { if (index + 1 < urls.length) setFailed({ key, index: index + 1 }); };

  // An image can fail before React hydrates (missing the error event), so check once mounted.
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0 && index + 1 < urls.length) setFailed({ key, index: index + 1 });
  }, [key, index, urls.length]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      key={`${key}-${index}`}
      src={urls[index]}
      alt=""
      draggable={false}
      className={`sprite block max-w-none select-none ${className ?? ""}`}
      // `zoom` scales the layout box too, so the sprite stays anchored at its feet.
      style={{ ...style, zoom: scale }}
      onError={tryNext}
    />
  );
}

/* ───────────────────────── Poké Balls ───────────────────────── */

export type BallId = "poke-ball" | "premier-ball" | "great-ball" | "ultra-ball" | "luxury-ball" | "master-ball";

export const BALLS: Record<BallId, { name: string; a: string }> = {
  "poke-ball": { name: "Poké Ball", a: "a" },
  "premier-ball": { name: "Premier Ball", a: "a" },
  "great-ball": { name: "Great Ball", a: "a" },
  "ultra-ball": { name: "Ultra Ball", a: "an" },
  "luxury-ball": { name: "Luxury Ball", a: "a" },
  "master-ball": { name: "Master Ball", a: "a" },
};

// The rarer your answer, the fancier the ball you get to throw.
export const BALL_FOR_TIER: Record<TierId, BallId> = {
  common: "poke-ball",
  meme: "premier-ball",
  uncommon: "great-ball",
  rare: "ultra-ball",
  ultra: "luxury-ball",
  shiny: "master-ball",
  miss: "poke-ball",
};

// How many times the ball wobbles before it clicks shut: more suspense for rarer catches.
export const SHAKES_FOR_TIER: Record<TierId, number> = { common: 1, meme: 1, uncommon: 2, rare: 3, ultra: 3, shiny: 3, miss: 0 };

// How full the rarity meter gets (out of 5).
export const RARITY_LEVEL: Record<TierId, number> = { common: 1, meme: 1, uncommon: 2, rare: 3, ultra: 4, shiny: 5, miss: 0 };

export const ballUrl = (ball: BallId) => `${PA}/items/${ball}.png`;

export function BallIcon({ ball, size = 30, className, style }: { ball: BallId; size?: number; className?: string; style?: CSSProperties }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={ballUrl(ball)} alt={BALLS[ball].name} width={size} height={size} draggable={false} className={`sprite inline-block select-none ${className ?? ""}`} style={style} />;
}
