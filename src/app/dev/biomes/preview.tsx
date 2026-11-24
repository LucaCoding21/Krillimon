"use client";

import { BIOMES, Trek } from "@/components/Trek";

export function BiomePreview() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      {BIOMES.map((b) => (
        <div key={b.name} className="overflow-hidden rounded-3xl border-4 border-white/80">
          <Trek meters={b.from + 120} party={[25, 4, 7]} encounter="idle" height="260px" />
        </div>
      ))}
    </div>
  );
}
