"use client";

import { useState } from "react";
import { TIERS, metersFor, type TierId } from "@/lib/game";
import { Scene, LEDGES, type Outcome } from "@/components/Scene";
import { STRATA } from "@/components/World";

// Every layer of the dig, plus a button per tier to watch the fall (development only).
export function BiomePreview() {
  const [depth, setDepth] = useState(0);
  const [drop, setDrop] = useState<{ outcome: Outcome | null; key: number }>({ outcome: null, key: 0 });
  const [floor, setFloor] = useState(0);

  const fall = (tier: TierId) => {
    setFloor(depth);
    setDrop((d) => ({
      key: d.key + 1,
      outcome: { kind: "catch", tier, mon: { id: 352, name: "Kecleon", types: ["normal"] }, target: depth + metersFor(TIERS[tier].score) },
    }));
  };

  return (
    <div className="fixed inset-0">
      <Scene floor={floor} partner={{ id: 25, name: "Pikachu", types: ["electric"] }} outcome={drop.outcome} roundKey={drop.key}
        bottom={250} top={112} hud onSettled={() => {}} />
      <div className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center gap-2 bg-navy/90 p-3 text-sm font-bold">
        <select className="rounded bg-panel-2 px-2 py-1" value={depth} onChange={(e) => {
          const m = Number(e.target.value); setDepth(m); setFloor(m); setDrop((d) => ({ key: d.key + 1, outcome: null }));
        }}>
          {STRATA.map((s) => <option key={s.name} value={s.from === 0 ? 0 : s.from + 60}>{s.name} ({s.from === 0 ? 0 : s.from + 60} m)</option>)}
        </select>
        {LEDGES.map((t) => <button key={t} className="rounded bg-panel-2 px-3 py-1" style={{ color: TIERS[t].color }} onClick={() => fall(t)}>{TIERS[t].name}</button>)}
        <button className="rounded bg-panel-2 px-3 py-1" onClick={() => setDrop((d) => ({ key: d.key + 1, outcome: { kind: "miss" } }))}>Miss</button>
        <button className="rounded bg-panel-2 px-3 py-1" onClick={() => setDrop((d) => ({ key: d.key + 1, outcome: null }))}>Reset</button>
      </div>
    </div>
  );
}
