"use client";

import { Arena } from "@/components/Arena";
import { BIOMES } from "@/components/Backdrop";

// Every biome's battle arena, for checking the art (development only).
export function BiomePreview() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      {BIOMES.map((b, i) => (
        <div key={b.name} className="h-[420px] overflow-hidden rounded-3xl border-4 border-white/80">
          <Arena meters={b.from + 120} partner={{ id: 25, name: "Pikachu", types: ["electric"] }} partnerKey={i}
            wild={{ id: 6, name: "Charizard", types: ["fire", "flying"] }} tier={i === 8 ? "shiny" : "rare"} ball="ultra-ball"
            stage={i % 2 ? "reveal" : "waiting"} roundKey={i} />
        </div>
      ))}
    </div>
  );
}
