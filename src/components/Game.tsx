"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from "react";
import { ROUND_MS, TIERS, type TierId } from "@/lib/game";
import type { GuessResult, PokeRef, ResultsPayload, RunState } from "@/lib/api-types";
import { isMuted, setMuted, sfx, subscribeMuted } from "@/lib/sfx";
import { TIER_GRADIENT, TierChip, TierIcon, TimerBar, PixelArt } from "./pixel";
import { Arena, type Mon, type Stage } from "./Arena";
import { Backdrop, DepthGauge, JourneyMap, biomeAt, biomeIndexAt } from "./Backdrop";
import { padArt } from "./art";
import { BALLS, BALL_FOR_TIER, BallIcon, SHAKES_FOR_TIER, Sprite } from "./sprites";
import { Typewriter } from "./Typewriter";

type Screen =
  | { name: "title" }
  | { name: "play"; state: RunState }
  | { name: "results"; runId: string };

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? { cache: "no-store" } : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const subscribeResize = (cb: () => void) => { window.addEventListener("resize", cb); return () => window.removeEventListener("resize", cb); };
const useWidth = () => useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 1280);
const TIER_ORDER: TierId[] = ["shiny", "ultra", "rare", "uncommon", "meme", "common", "miss"];

// Every run starts with a partner, picked from the run id.
const BUDDIES: Mon[] = [
  { id: 25, name: "Pikachu", types: ["electric"] }, { id: 133, name: "Eevee", types: ["normal"] },
  { id: 1, name: "Bulbasaur", types: ["grass", "poison"] }, { id: 4, name: "Charmander", types: ["fire"] }, { id: 7, name: "Squirtle", types: ["water"] },
  { id: 152, name: "Chikorita", types: ["grass"] }, { id: 155, name: "Cyndaquil", types: ["fire"] }, { id: 158, name: "Totodile", types: ["water"] },
  { id: 252, name: "Treecko", types: ["grass"] }, { id: 255, name: "Torchic", types: ["fire"] }, { id: 258, name: "Mudkip", types: ["water"] },
  { id: 387, name: "Turtwig", types: ["grass"] }, { id: 390, name: "Chimchar", types: ["fire"] }, { id: 393, name: "Piplup", types: ["water"] },
  { id: 495, name: "Snivy", types: ["grass"] }, { id: 498, name: "Tepig", types: ["fire"] }, { id: 501, name: "Oshawott", types: ["water"] },
  { id: 650, name: "Chespin", types: ["grass"] }, { id: 653, name: "Fennekin", types: ["fire"] }, { id: 656, name: "Froakie", types: ["water"] },
  { id: 722, name: "Rowlet", types: ["grass", "flying"] }, { id: 725, name: "Litten", types: ["fire"] }, { id: 728, name: "Popplio", types: ["water"] },
  { id: 810, name: "Grookey", types: ["grass"] }, { id: 813, name: "Scorbunny", types: ["fire"] }, { id: 816, name: "Sobble", types: ["water"] },
  { id: 906, name: "Sprigatito", types: ["grass"] }, { id: 909, name: "Fuecoco", types: ["fire"] }, { id: 912, name: "Quaxly", types: ["water"] },
];
const buddyFor = (runId: string) => BUDDIES[[...runId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % BUDDIES.length];
const PIKACHU = BUDDIES[0];

/* ═══════════════════════════ Shell ═══════════════════════════ */

export default function Game() {
  const [screen, setScreen] = useState<Screen>({ name: "title" });
  const [wipe, setWipe] = useState<"idle" | "in" | "out">("idle");
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);

  async function go(next: Screen) {
    setWipe("in");
    await sleep(470);
    setScreen(next);
    window.scrollTo(0, 0);
    setWipe("out");
    await sleep(470);
    setWipe("idle");
  }

  async function start(mode: "daily" | "practice") {
    const state = await api<RunState>("/api/play", { mode });
    sfx.start();
    await go(state.completed ? { name: "results", runId: state.runId } : { name: "play", state });
  }

  const onTitle = screen.name === "title";

  return (
    <div className="relative min-h-screen">
      {onTitle && (
        <>
          <div className="fixed inset-0"><Arena meters={0} partner={PIKACHU} partnerKey="title" stage="rustle" layout="title" showCards={false} /></div>
          <div className="pointer-events-none fixed inset-0 bg-gradient-to-r from-navy/75 via-navy/15 to-transparent" />
        </>
      )}

      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-2 p-3 sm:p-4">
        <button className="pill" onClick={() => { if (!onTitle) { sfx.select(); void go({ name: "title" }); } }}>
          <span className="pill-icon"><BallIcon ball="poke-ball" size={26} /></span>Tall Grass
        </button>
        <button className="pill" onClick={() => { setMuted(!muted); if (muted) sfx.select(); }} aria-label="Toggle sound">
          <span className="pill-icon text-sm">{muted ? "🔇" : "🔊"}</span>{muted ? "Sound off" : "Sound on"}
        </button>
      </header>

      <main className="relative z-10">
        {screen.name === "title" && <Title onStart={start} />}
        {screen.name === "play" && (
          <Play key={screen.state.runId} initial={screen.state} onFinished={(runId) => go({ name: "results", runId })} />
        )}
        {screen.name === "results" && (
          <Results runId={screen.runId} onTitle={() => go({ name: "title" })} onPractice={() => start("practice")} />
        )}
      </main>

      {wipe !== "idle" && (
        <div className={`wipe ${wipe}`} aria-hidden>
          {Array.from({ length: 10 }, (_, i) => <div key={i} style={{ "--i": i } as CSSProperties} />)}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════ Title ═══════════════════════════ */

function Title({ onStart }: { onStart: (mode: "daily" | "practice") => Promise<void> }) {
  const [busy, setBusy] = useState<null | "daily" | "practice">(null);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState(false);

  async function begin(mode: "daily" | "practice") {
    if (busy) return;
    sfx.select(); setBusy(mode); setError(null);
    try { await onStart(mode); } catch (e) { setError((e as Error).message); setBusy(null); }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRules(false);
      if (e.key === "Enter" && !rules) void begin("daily");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 pb-8 pt-20">
      <div className="w-full max-w-[470px] space-y-4">
        <div className="logo-in">
          <h1 className="outlined text-[64px] leading-[.95] sm:text-[78px]">
            <span className="text-white">Tall</span><span className="text-gold">Grass</span>
          </h1>
          <p className="mt-3 max-w-sm text-lg font-extrabold text-white [text-shadow:0_2px_0_rgba(20,26,51,.8)]">
            Something&apos;s in the grass. Name the Pokémon nobody else thinks of, and earn a rarer ball to catch it.
          </p>
        </div>

        <button onClick={() => begin("daily")} disabled={!!busy} className="tile t-green stripes ring rise min-h-[112px] w-full">
          <span className="tile-icon"><BallIcon ball="poke-ball" size={44} className="ball-bob" /></span>
          <span className="flex-1">
            <span className="block font-display text-[34px] font-black leading-none">{busy === "daily" ? "Loading…" : "Play"}</span>
            <span className="mt-1 block text-[15px] font-extrabold opacity-90">Today&apos;s 6 encounters</span>
          </span>
          <span className="hidden h-[84px] w-[84px] shrink-0 items-end justify-center overflow-hidden rounded-2xl bg-white/25 pb-1 ring-2 ring-white/40 sm:flex">
            <Sprite id={25} name="Pikachu" scale={1} />
          </span>
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => begin("practice")} disabled={!!busy} className="tile t-blue stripes rise" style={{ animationDelay: "60ms" }}>
            <span className="tile-icon !h-11 !w-11"><BallIcon ball="great-ball" size={34} /></span>
            <span>
              <span className="block font-display text-xl font-black leading-tight">{busy === "practice" ? "Loading…" : "Practice"}</span>
              <span className="block text-[13px] font-bold opacity-90">Unlimited runs</span>
            </span>
          </button>
          <button onClick={() => { sfx.select(); setRules(true); }} className="tile t-purple stripes rise" style={{ animationDelay: "120ms" }}>
            <span className="tile-icon !h-11 !w-11"><BallIcon ball="master-ball" size={34} /></span>
            <span>
              <span className="block font-display text-xl font-black leading-tight">How to play</span>
              <span className="block text-[13px] font-bold opacity-90">Balls &amp; rarity</span>
            </span>
          </button>
        </div>
        {error && <p className="panel px-4 py-3 font-bold text-coral">{error}</p>}

        <p className="text-xs font-bold text-white/75 [text-shadow:0_1px_0_rgba(0,0,0,.6)]">
          Press <span className="keycap !h-5 !min-w-0 !text-[10px]">Enter</span> to play · Fan-made · Data: PokéAPI · Sprites: Pokémon Showdown / Smogon Sprite Project · Not affiliated with Nintendo / Game Freak
        </p>
      </div>

      {rules && <RulesModal onClose={() => { sfx.select(); setRules(false); }} />}
    </div>
  );
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-navy/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="panel rise max-h-[92vh] w-full max-w-lg overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-black">How to play</h2>
        <p className="mt-2 font-semibold text-muted">
          Each round, something rustles in the tall grass and you get a prompt and 25 seconds. Name any Pokémon that fits and it pops out.
          The fewer trainers who&apos;d think of it, the better the ball you throw and the more points you score.
        </p>
        <ul className="mt-4 space-y-2">
          {(["common", "meme", "uncommon", "rare", "ultra", "shiny"] as TierId[]).map((t) => (
            <li key={t} className="flex items-center gap-3 rounded-2xl bg-panel-2/70 px-3 py-2">
              <BallIcon ball={BALL_FOR_TIER[t]} size={40} />
              <span className="flex-1">
                <span className="block font-display font-black" style={{ color: TIERS[t].color }}>{TIERS[t].name} <span className="font-body text-sm text-muted">· {BALLS[BALL_FOR_TIER[t]].name}</span></span>
                <span className="block text-sm font-semibold text-muted">{TIERS[t].blurb}</span>
              </span>
              <span className="font-display text-xl font-black">{TIERS[t].score}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm font-semibold text-muted">The Shiny is today&apos;s hidden gem for each prompt: it shows up in its shiny colors and earns the Master Ball.</p>
        <button onClick={onClose} className="tile t-slate stripes mt-5 w-full justify-center py-3 font-display text-lg font-black">Got it</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════ Play ═══════════════════════════ */

type Feedback = { tier: TierId; score: number; pokemon: PokeRef | null; corrected: boolean; raw: string; gaveUp?: boolean };

// When each beat of the catch starts (ms after the Pokémon pops out).
const BEAT = { throw: 1100, absorb: 1800, shake: 2250, drop: 450, wobble: 700 };

function Play({ initial, onFinished }: { initial: RunState; onFinished: (runId: string) => void }) {
  const [state, setState] = useState(initial);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [nextState, setNextState] = useState<RunState | null>(null);
  const [stage, setStage] = useState<Stage>("rustle");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [badKey, setBadKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(() => initial.serverNow - Date.now()); // server clock minus ours
  const [skipping, setSkipping] = useState(false);
  const [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  const [panelH, setPanelH] = useState(290);
  const fastForward = useRef(false);
  const width = useWidth();
  const narrow = width < 640;
  const wide = width >= 1100;

  // The arena sits above the docked panel, so track its height.
  useLayoutEffect(() => {
    if (!panelEl) return;
    const ro = new ResizeObserver(() => setPanelH(panelEl.offsetHeight));
    ro.observe(panelEl);
    return () => ro.disconnect();
  }, [panelEl]);

  const adopt = (s: RunState) => { setOffset(s.serverNow - Date.now()); setState(s); };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);

  // Start the clock for a round that hasn't started yet.
  useEffect(() => {
    if (feedback || state.completed || state.answeringOpensAt) return;
    let cancelled = false;
    api<RunState>("/api/round", { runId: state.runId, action: "start" })
      .then((s) => { if (!cancelled) { adopt(s); sfx.rustle(); } })
      .catch((e) => setError(e.message));
    return () => { cancelled = true; };
  }, [state.runId, state.round, state.answeringOpensAt, state.completed, feedback]);

  // Your partner is sent out at the start of every round.
  useEffect(() => { sfx.sendout(); }, [state.round]);

  const serverNow = now + offset;
  const phase = !state.answeringOpensAt ? "loading"
    : serverNow < state.answeringOpensAt ? "ready"
    : serverNow < (state.deadline ?? 0) ? "answering" : "timeup";
  const remaining = Math.max(0, (state.deadline ?? 0) - serverNow);
  const secondsLeft = Math.ceil(remaining / 1000);

  useEffect(() => { if (phase === "answering") inputEl?.focus(); }, [phase, inputEl]);
  useEffect(() => { if (phase === "answering" && secondsLeft <= 5 && secondsLeft > 0) sfx.tick(); }, [phase, secondsLeft]);

  function showFeedback(fb: Feedback, s: RunState) {
    fastForward.current = false;
    setFeedback(fb); setNextState(s); setAnswer(""); setError(null);
    if (fb.pokemon) { setStage("reveal"); sfx.reveal(); }
    else { setStage("fled"); sfx.miss(); }
  }

  // The catch: throw → absorb → shake (a wobble per beat) → caught.
  useEffect(() => {
    if (!feedback?.pokemon) return;
    const tier = feedback.tier;
    const wobbles = SHAKES_FOR_TIER[tier];
    const caughtAt = BEAT.shake + BEAT.drop + wobbles * BEAT.wobble + 150;
    const at = (ms: number, fn: () => void) => setTimeout(() => { if (!fastForward.current) fn(); }, ms);
    const timers = [
      at(BEAT.throw, () => { setStage("throw"); sfx.throw(); }),
      at(BEAT.absorb, () => { setStage("absorb"); sfx.pop(); }),
      at(BEAT.shake, () => setStage("shake")),
      ...Array.from({ length: wobbles }, (_, i) => at(BEAT.shake + BEAT.drop + i * BEAT.wobble + 60, () => sfx.wiggle())),
      at(caughtAt, () => { setStage("caught"); sfx.click(); sfx.catch(tier); }),
    ];
    return () => timers.forEach(clearTimeout);
  }, [feedback]);

  const done = !!feedback && (stage === "caught" || stage === "fled");

  // Enter (or a click on the panel) skips straight to the catch.
  function skipAhead() {
    if (!feedback || done) return;
    fastForward.current = true;
    if (feedback.pokemon) { setStage("caught"); sfx.click(); sfx.catch(feedback.tier); }
  }

  // Out of time: the round is a miss (unless a last-second guess is still in flight).
  useEffect(() => {
    if (phase !== "timeup" || feedback || busy || skipping) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSkipping(true);
    api<RunState>("/api/round", { runId: state.runId, action: "skip" })
      .then((s) => { if (!cancelled) showFeedback({ tier: "miss", score: 0, pokemon: null, corrected: false, raw: "" }, s); })
      .catch((e) => setError(e.message))
      .finally(() => setSkipping(false));
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, feedback, busy]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || phase !== "answering" || !answer.trim()) return;
    setBusy(true); setError(null);
    const typed = answer;
    try {
      const r = await api<GuessResult>("/api/guess", { runId: state.runId, answer: typed });
      if (r.status === "rejected") {
        setError(r.reason); setBadKey((k) => k + 1); sfx.wrong();
        requestAnimationFrame(() => inputEl?.select());
      } else if (r.status === "accepted") {
        showFeedback({ tier: r.tier, score: r.score, pokemon: r.pokemon, corrected: r.corrected, raw: typed }, r.state);
      } else {
        showFeedback({ tier: "miss", score: 0, pokemon: null, corrected: false, raw: typed }, r.state);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function giveUp() {
    if (busy || feedback || phase !== "answering") return;
    setBusy(true);
    try {
      const s = await api<RunState>("/api/round", { runId: state.runId, action: "skip" });
      showFeedback({ tier: "miss", score: 0, pokemon: null, corrected: false, raw: "", gaveUp: true }, s);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  function next() {
    if (!nextState) return;
    sfx.select();
    if (nextState.completed) { onFinished(nextState.runId); return; }
    adopt(nextState); setFeedback(null); setNextState(null); setStage("rustle");
  }

  // Score, depth and team update once the ball clicks shut.
  const applied = done && nextState ? nextState : state;
  const meters = applied.score * 10;
  const lastCatch = [...state.results].reverse().find((r) => r.pokemon)?.pokemon;
  const partner: Mon = lastCatch ? { id: lastCatch.id, name: lastCatch.name, types: lastCatch.types } : buddyFor(state.runId);
  const tier = feedback?.tier ?? null;
  const ball = BALL_FOR_TIER[tier ?? "common"];
  const arenaStage: Stage = feedback ? stage : phase === "answering" ? "waiting" : "rustle";
  const hudTop = narrow ? 104 : 112;
  const t = tier ? TIERS[tier] : null;

  const line = !feedback ? "" : !feedback.pokemon
    ? (feedback.gaveUp ? "You let it slip away…" : feedback.raw ? `Too slow! “${feedback.raw}” didn't count.` : "It got away…")
    : stage === "reveal" ? (tier === "shiny" ? `Whoa, a shiny ${feedback.pokemon.name}!` : `It's ${feedback.pokemon.name}!`)
    : stage === "throw" || stage === "absorb" ? `You threw ${BALLS[ball].a} ${BALLS[ball].name}!`
    : stage === "shake" ? ""
    : `Caught! ${feedback.pokemon.name} joins your team.`;

  return (
    <>
      <div className="fixed inset-0">
        <Arena
          meters={meters} partner={partner} partnerKey={`${partner.id}-${state.round}`}
          wild={feedback?.pokemon ? { id: feedback.pokemon.id, name: feedback.pokemon.name, types: feedback.pokemon.types } : null}
          tier={tier} ball={ball} shakes={tier ? SHAKES_FOR_TIER[tier] : 1}
          stage={arenaStage} roundKey={state.round} floor={panelH + 8} top={hudTop}
        />
      </div>

      {/* HUD: round + the ball you used for each catch, and your score */}
      <div className="pointer-events-none fixed inset-x-0 top-[60px] z-20 sm:top-[66px]">
        <div className="mx-auto flex max-w-[1280px] items-start justify-between gap-2 px-3">
          <div className="pill !h-11 !pl-4">
            <span className="whitespace-nowrap font-display text-[15px] font-black"><span className="hidden sm:inline">Round </span>{Math.min(state.round + 1, state.rounds)}<span className="text-muted">/{state.rounds}</span></span>
            <span className="ml-1 flex gap-1">
              {Array.from({ length: state.rounds }, (_, i) => {
                const r = applied.results.find((x) => x.round === i);
                return (
                  <span key={i} className={`grid h-6 w-6 place-items-center rounded-full sm:h-7 sm:w-7 ${r ? "bg-white/10" : i === state.round && !feedback ? "blink bg-gold/25 ring-2 ring-gold" : "bg-white/5 ring-1 ring-white/10"}`}>
                    {r && (r.pokemon ? <BallIcon ball={BALL_FOR_TIER[r.tier]} size={narrow ? 22 : 26} className="pop-in" /> : <span className="pop-in"><TierIcon tier="miss" scale={2} /></span>)}
                  </span>
                );
              })}
            </span>
          </div>
          <div className="pill !h-11 !pl-3">
            <span className="text-gold">★</span>
            <span className="font-display text-lg font-black tabular-nums"><Counter value={applied.score} /></span>
          </div>
        </div>
      </div>

      {/* how deep into the wild you are */}
      {!narrow && (
        <div className="pointer-events-none fixed right-4 z-20" style={{ top: hudTop + 16, bottom: panelH + 28 }}>
          <DepthGauge meters={meters} labels={wide} />
        </div>
      )}

      {/* the docked battle panel */}
      <div ref={setPanelEl} className="fixed inset-x-0 bottom-0 z-20 px-3 pb-3 sm:pb-5">
        <div key={badKey} className={`panel mx-auto max-w-[720px] p-5 sm:p-6 ${badKey ? "shake" : ""}`}>
          {feedback && t ? (
            <div className="flex min-h-[176px] cursor-pointer flex-col" onClick={skipAhead}>
              <p className="min-h-[1.4em] font-display text-[24px] font-black leading-snug sm:text-[28px]">
                {stage === "shake"
                  ? <span className="tracking-[0.3em]"><span className="blink">●</span> <span className="blink" style={{ animationDelay: ".2s" }}>●</span> <span className="blink" style={{ animationDelay: ".4s" }}>●</span></span>
                  : <Typewriter key={`${state.round}-${stage}`} text={line} speed={22} />}
              </p>
              {done && (
                <div className="rise mt-3 flex flex-wrap items-center gap-3">
                  <TierChip tier={feedback.tier} points={false} />
                  <span className="outlined text-[30px] leading-none text-gold">+{feedback.score}</span>
                  {feedback.score > 0 && <span className="font-display text-lg font-black text-white/70">+{(feedback.score * 10).toLocaleString()} m deeper</span>}
                  <span className="basis-full font-semibold text-muted">
                    {t.blurb}{feedback.corrected && feedback.pokemon ? ` (read “${feedback.raw}” as ${feedback.pokemon.name})` : ""}
                  </span>
                </div>
              )}
              <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                {!done ? <span className="text-sm font-bold text-muted/70">Click or press Enter to skip</span> : <span />}
                {done ? (
                  <button autoFocus onClick={(e) => { e.stopPropagation(); next(); }} className="tile t-green stripes rise px-6 py-3">
                    <span className="font-display text-xl font-black">{nextState?.completed ? "See your team" : "Next encounter"}</span>
                    <span className="keycap">Enter</span>
                  </button>
                ) : (
                  <button autoFocus onClick={(e) => { e.stopPropagation(); skipAhead(); }} className="sr-only">Skip</button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="flex min-h-[176px] flex-col">
              <p className="text-[12px] font-black uppercase tracking-[0.2em] text-gold">Encounter {state.round + 1} · {state.label}</p>
              <p className="mt-1 min-h-[2.6em] font-display text-[24px] font-black leading-snug sm:text-[28px]">
                {state.prompt && <Typewriter key={`p-${state.round}`} text={state.prompt.text} speed={18} />}
              </p>
              <div className="mt-3">
                <TimerBar value={phase === "answering" ? remaining / ROUND_MS : phase === "timeup" ? 0 : 1}
                  seconds={phase === "answering" ? secondsLeft : null} low={phase === "answering" && remaining < 5_000} />
              </div>
              <div className="mt-4 flex gap-2">
                <input
                  ref={setInputEl}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={phase !== "answering"}
                  placeholder={phase === "answering" ? "Name a Pokémon…" : "Something's rustling…"}
                  autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={40}
                  className="h-14 min-w-0 flex-1 rounded-2xl bg-white px-5 text-xl font-extrabold text-navy shadow-[inset_0_-3px_0_rgba(0,0,0,.12)] outline-none ring-4 ring-transparent transition placeholder:text-slate-400 focus:ring-gold/70 disabled:bg-white/50"
                />
                <button type="submit" disabled={busy || phase !== "answering" || !answer.trim()} className="tile t-coral stripes h-14 gap-2 px-4 py-0">
                  <BallIcon ball="poke-ball" size={30} />
                  <span className="font-display text-xl font-black">{busy ? "…" : "Throw!"}</span>
                </button>
              </div>
              <div className="mt-auto flex min-h-7 items-end justify-between gap-3 pt-2">
                <p className="font-bold leading-tight text-coral">{error}</p>
                {phase === "answering" && (
                  <button type="button" onClick={giveUp} className="shrink-0 text-sm font-extrabold text-muted hover:text-white">Run away →</button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

// Score that counts up instead of jumping.
function Counter({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (shown === value) return;
    const step = Math.max(1, Math.round(Math.abs(value - shown) / 12));
    const t = setTimeout(() => setShown((s) => (s < value ? Math.min(value, s + step) : Math.max(value, s - step))), 30);
    return () => clearTimeout(t);
  }, [shown, value]);
  return <>{shown}</>;
}

/* ═══════════════════════════ Results ═══════════════════════════ */

function Results({ runId, onTitle, onPractice }: {
  runId: string; onTitle: () => void; onPractice: () => Promise<void>;
}) {
  const [data, setData] = useState<ResultsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [opened, setOpened] = useState(0); // team members sent out so far
  const width = useWidth();
  const [vh, setVh] = useState(800);

  useEffect(() => {
    api<ResultsPayload>(`/api/results?runId=${encodeURIComponent(runId)}`)
      .then((d) => { setData(d); sfx.fanfare(); })
      .catch((e) => setError(e.message));
  }, [runId]);

  useEffect(() => {
    const measure = () => setVh(window.innerHeight);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Send your team out one ball at a time.
  useEffect(() => {
    if (!data) return;
    const id = setInterval(() => {
      setOpened((n) => {
        if (n >= data.rounds.length) { clearInterval(id); return n; }
        if (data.rounds[n]?.yours?.pokemon) sfx.sendout(); else sfx.miss();
        return n + 1;
      });
    }, 520);
    return () => clearInterval(id);
  }, [data]);

  const maxBucket = Math.max(1, ...(data?.stats?.buckets ?? [1]));
  const meters = (data?.score ?? 0) * 10;
  const reached = biomeAt(meters);
  const bi = biomeIndexAt(meters);
  const S = width < 640 ? 2 : 3;

  const world = (
    <div className="fixed inset-0">
      <Backdrop meters={meters} groundTop={vh * 0.42} width={width} height={vh} scale={S} drift={meters * 1.5} />
      <div className="absolute inset-0 bg-gradient-to-b from-navy/30 via-transparent to-navy/80" />
    </div>
  );
  if (error) return <>{world}<div className="relative z-10 mx-auto max-w-lg px-4 pt-28"><div className="panel p-5 font-bold text-coral">{error}</div></div></>;
  if (!data) return <>{world}<div className="relative z-10 mx-auto max-w-lg px-4 pt-28"><div className="panel p-5 font-display text-xl font-black"><span className="blink">Tallying your catches…</span></div></div></>;

  const best = data.rounds.map((r) => r.yours).filter((y): y is NonNullable<typeof y> => !!y?.pokemon)
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))[0];

  return (
    <>
      {world}
      <div className="relative z-10 mx-auto max-w-[1040px] space-y-6 px-3 pb-14 pt-[84px] sm:pt-24">
        <div className="text-center">
          <p className="text-[12px] font-black uppercase tracking-[0.25em] text-gold">Field report · {data.label}</p>
          <h1 className="outlined text-[44px] leading-tight text-white sm:text-[56px]">Your team</h1>
          <p className="font-display text-lg font-black text-white/85 [text-shadow:0_2px_0_rgba(20,26,51,.8)]">
            Reached {reached.name} · {meters.toLocaleString()} m into the wild
          </p>
        </div>

        {/* the lineup */}
        <div className="grid grid-cols-3 gap-x-2 gap-y-5 sm:grid-cols-6">
          {data.rounds.map((r, i) => {
            const tier = r.yours?.tier ?? "miss";
            const out = i < opened;
            return (
              <div key={i} className="flex flex-col items-center">
                <div className="relative flex h-[150px] w-full items-end justify-center sm:h-[170px]">
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2"><PixelArt art={padArt(bi)} scale={2} /></div>
                  {out ? (
                    r.yours?.pokemon ? (
                      <div className="sendout relative mb-5">
                        <Sprite id={r.yours.pokemon.id} name={r.yours.pokemon.name} shiny={tier === "shiny"} scale={width < 640 ? 1.4 : 1.8} />
                        <div className="flash-ring pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
                        {tier === "shiny" && [0, 1, 2].map((k) => <span key={k} className="sparkle" style={{ left: `${10 + k * 35}%`, top: `${k % 2 ? 10 : -6}%`, animationDelay: `${k * 0.3}s` }} />)}
                      </div>
                    ) : (
                      <div className="pop-in mb-8 opacity-60"><TierIcon tier="miss" scale={5} /></div>
                    )
                  ) : (
                    <div className="ball-bob mb-7"><BallIcon ball={r.yours?.pokemon ? BALL_FOR_TIER[tier] : "poke-ball"} size={40} /></div>
                  )}
                </div>
                <div className={`mt-2 flex flex-col items-center text-center transition-opacity duration-300 ${out ? "opacity-100" : "opacity-0"}`}>
                  <p className="font-display text-[15px] font-black leading-tight">{r.yours?.pokemon?.name ?? "Got away"}</p>
                  <div className="mt-1 flex items-center gap-1">
                    {r.yours?.pokemon && <BallIcon ball={BALL_FOR_TIER[tier]} size={22} />}
                    <span className="text-[12px] font-black" style={{ color: tier === "miss" ? "#a7afd1" : TIERS[tier].color }}>{TIERS[tier].name} · +{r.yours?.score ?? 0}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="panel rise flex flex-col p-5 sm:p-6">
            <p className="text-[12px] font-black uppercase tracking-[0.2em] text-gold">Score</p>
            <div className="mt-2 flex items-end gap-2">
              <span className="outlined text-[72px] leading-[.9] text-white"><Counter value={data.score} /></span>
              <span className="mb-2 font-display text-2xl font-black text-muted">/ {data.maxScore}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="chip h-8 px-4 text-[15px]" style={{ background: TIER_GRADIENT.shiny, color: "#3a2400" }}>🏆 {data.title.name}</span>
              <span className="text-sm font-bold text-muted">{data.title.text}</span>
            </div>
            <div className="mt-4 flex gap-1.5">
              {data.rounds.map((r, i) => (
                <span key={i} className="pop-in grid h-11 w-11 place-items-center rounded-full" style={{ animationDelay: `${250 + i * 120}ms`, background: "rgba(255,255,255,.07)" }}>
                  {r.yours?.pokemon ? <BallIcon ball={BALL_FOR_TIER[r.yours.tier]} size={34} /> : <TierIcon tier="miss" scale={3} />}
                </span>
              ))}
            </div>
            {best?.pokemon && (
              <p className="mt-4 font-bold text-muted">Best catch: <span className="font-black text-white">{best.pokemon.name}</span> <span style={{ color: TIERS[best.tier].color }}>({TIERS[best.tier].name})</span></p>
            )}
            <div className="mt-auto grid grid-cols-3 gap-2 pt-5">
              <button className="tile t-gold stripes justify-center px-2 py-3" onClick={async () => {
                await navigator.clipboard.writeText(`${data.share}\n📍 ${reached.name} · ${meters.toLocaleString()} m`); setCopied(true); sfx.select(); setTimeout(() => setCopied(false), 1500);
              }}><span className="font-display text-lg font-black">{copied ? "Copied!" : "Share"}</span></button>
              <button className="tile t-blue stripes justify-center px-2 py-3" disabled={starting} onClick={async () => {
                setStarting(true); sfx.select();
                try { await onPractice(); } catch (e) { setError((e as Error).message); setStarting(false); }
              }}><span className="font-display text-lg font-black">{starting ? "…" : "Practice"}</span></button>
              <button className="tile t-slate stripes justify-center px-2 py-3" onClick={() => { sfx.select(); onTitle(); }}>
                <span className="font-display text-lg font-black">Home</span>
              </button>
            </div>
          </div>

          <div className="panel rise flex flex-col p-5 sm:p-6" style={{ animationDelay: "80ms" }}>
            <p className="text-[12px] font-black uppercase tracking-[0.2em] text-gold">Expedition</p>
            <p className="mt-2 text-sm font-extrabold text-muted">You made it to</p>
            <p className="outlined text-[40px] leading-tight text-white">{reached.name}</p>
            <p className="font-display text-xl font-black text-gold">{meters.toLocaleString()} m into the wild</p>
            <div className="mt-4"><JourneyMap meters={meters} /></div>
            {data.stats && (
              <div className="mt-5">
                <p className="font-bold">
                  {data.stats.betterThan === null
                    ? "You're one of the first trainers out today!"
                    : <>Deeper than <span className="text-gold">{data.stats.betterThan}%</span> of today&apos;s {data.stats.players.toLocaleString()} trainers</>}
                </p>
                <div className="mt-2 flex h-14 items-end gap-1">
                  {data.stats.buckets.map((n, b) => (
                    <div key={b} className="flex-1 rounded-t-md" title={`${b * 500}–${b * 500 + 499} m: ${n}`}
                      style={{
                        height: `${Math.max(8, (n / maxBucket) * 100)}%`,
                        background: b === data.stats!.yourBucket ? "linear-gradient(180deg,#ffe066,#f2a516)" : n ? "#56609a" : "#2a3260",
                      }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <h2 className="outlined pt-2 text-3xl text-white">Encounter by encounter</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {data.rounds.map((r, i) => {
            const tier = r.yours?.tier ?? "miss";
            const labelColor = tier === "miss" ? "#a7afd1" : TIERS[tier].color;
            return (
              <div key={i} className="panel rise overflow-hidden" style={{ animationDelay: `${150 + i * 70}ms` }}>
                <div className="sunburst relative h-40" style={{ "--art": TIER_GRADIENT[tier] } as CSSProperties}>
                  <span className="absolute right-3 top-0 font-display text-[64px] font-black leading-none text-white/25">#{i + 1}</span>
                  {r.yours?.pokemon ? (
                    <div className="absolute bottom-3 right-6 flex flex-col items-center">
                      <Sprite id={r.yours.pokemon.id} name={r.yours.pokemon.name} shiny={tier === "shiny"} scale={1.5} />
                      <div className="-mt-1 h-3 w-20 rounded-[50%] bg-black/20" />
                    </div>
                  ) : (
                    <div className="absolute bottom-6 right-8"><TierIcon tier="miss" scale={8} /></div>
                  )}
                  <div className="plate absolute bottom-3 left-3 rounded-xl bg-navy/90 px-3 py-1.5">
                    <div>
                      <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: labelColor }}>
                        {r.yours?.pokemon && <BallIcon ball={BALL_FOR_TIER[tier]} size={18} />}
                        {TIERS[tier].name} · +{r.yours?.score ?? 0}
                      </p>
                      <p className="font-display text-xl font-black leading-tight">{r.yours?.pokemon?.name ?? "Got away"}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 p-4">
                  <p className="font-display text-lg font-black leading-snug">{r.prompt}</p>
                  {r.shiny && (
                    <div className="flex items-center gap-3 rounded-2xl px-2 py-1" style={{ background: "rgba(255, 201, 60, .1)", boxShadow: "inset 0 0 0 1px rgba(255, 201, 60, .3)" }}>
                      <span className="flex h-14 w-14 shrink-0 items-end justify-center overflow-hidden"><Sprite id={r.shiny.id} name={r.shiny.name} shiny scale={0.9} /></span>
                      <span className="text-sm font-bold text-muted">The Shiny (Master Ball) was <span className="font-black text-gold">{r.shiny.name}</span></span>
                    </div>
                  )}
                  <div className="space-y-1.5 text-[14px]">
                    {(["common", "uncommon", "rare", "ultra"] as TierId[]).map((tr) => (r.examples[tr]?.length ? (
                      <div key={tr} className="flex items-start gap-2">
                        <BallIcon ball={BALL_FOR_TIER[tr]} size={22} className="-mt-0.5 shrink-0" />
                        <span className="w-[78px] shrink-0 font-black" style={{ color: TIERS[tr].color }}>{TIERS[tr].name}</span>
                        <span className="font-semibold text-muted">{r.examples[tr]!.map((p) => p.name).join(", ")}</span>
                      </div>
                    ) : null))}
                  </div>
                  <p className="text-xs font-bold text-muted/70">{r.totalAnswers} valid answers</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
