"use client";

import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from "react";
import { ROUND_MS, TIERS, type TierId } from "@/lib/game";
import type { GuessResult, PokeRef, ResultsPayload, RunState } from "@/lib/api-types";
import { isMuted, setMuted, sfx, subscribeMuted } from "@/lib/sfx";
import { PixelArt, TIER_GRADIENT, TUFT, TierChip, TierIcon, TimerBar, TypeChip } from "./pixel";
import { JourneyMap, Trek, biomeAt, type Encounter, type Wanderer } from "./Trek";
import { PmdSprite } from "./PmdSprite";
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
const useNarrow = () => useSyncExternalStore(subscribeResize, () => window.innerWidth < 640, () => false);
const TIER_ORDER: TierId[] = ["shiny", "ultra", "rare", "uncommon", "meme", "common", "miss"];

// Every run gets a buddy (picked from the run id) who leads the party from the start.
const BUDDIES = [25, 133, 1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501, 650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912];
const buddyFor = (runId: string) => BUDDIES[[...runId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % BUDDIES.length];

const TITLE_WANDERERS: Wanderer[] = [
  { id: 25, left: "62%", lane: "path", facing: "left" },
  { id: 133, left: "84%", lane: "path", facing: "left" },
  { id: 1, left: "72%", lane: "field", facing: "downLeft" },
  { id: 7, left: "92%", lane: "field", facing: "downLeft" },
];

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
      {/* the pixel world, behind everything */}
      {onTitle && (
        <>
          <div className="fixed inset-0"><Trek meters={0} party={[]} hud={false} markers={false} wanderers={TITLE_WANDERERS} height="100dvh" /></div>
          <div className="pointer-events-none fixed inset-0 bg-gradient-to-r from-navy/70 via-navy/10 to-transparent" />
        </>
      )}

      {/* top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-2 p-3 sm:p-4">
        <button className="pill" onClick={() => { if (!onTitle) { sfx.select(); void go({ name: "title" }); } }}>
          <span className="pill-icon"><PixelArt art={TUFT} scale={1} /></span>Tall Grass
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
            Six prompts. 25 seconds each. Name the Pokémon nobody else thinks of.
          </p>
        </div>

        <button onClick={() => begin("daily")} disabled={!!busy} className="tile t-green stripes ring rise min-h-[112px] w-full">
          <span className="tile-icon"><PixelArt art={TUFT} scale={2} /></span>
          <span className="flex-1">
            <span className="block font-display text-[34px] font-black leading-none">{busy === "daily" ? "Loading…" : "Play"}</span>
            <span className="mt-1 block text-[15px] font-extrabold opacity-90">Today&apos;s encounter · 6 prompts</span>
          </span>
          <span className="hidden h-[84px] w-[84px] shrink-0 items-end justify-center overflow-hidden rounded-2xl bg-white/25 ring-2 ring-white/40 sm:flex">
            <PmdSprite id={25} height={70} />
          </span>
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => begin("practice")} disabled={!!busy} className="tile t-blue stripes rise" style={{ animationDelay: "60ms" }}>
            <span className="tile-icon !h-11 !w-11"><TierIcon tier="rare" scale={2} /></span>
            <span>
              <span className="block font-display text-xl font-black leading-tight">{busy === "practice" ? "Loading…" : "Practice"}</span>
              <span className="block text-[13px] font-bold opacity-90">Unlimited runs</span>
            </span>
          </button>
          <button onClick={() => { sfx.select(); setRules(true); }} className="tile t-purple stripes rise" style={{ animationDelay: "120ms" }}>
            <span className="tile-icon !h-11 !w-11"><TierIcon tier="shiny" scale={2} /></span>
            <span>
              <span className="block font-display text-xl font-black leading-tight">How to play</span>
              <span className="block text-[13px] font-bold opacity-90">Rarity tiers</span>
            </span>
          </button>
        </div>
        {error && <p className="panel px-4 py-3 font-bold text-coral">{error}</p>}

        <p className="text-xs font-bold text-white/75 [text-shadow:0_1px_0_rgba(0,0,0,.6)]">
          Press <span className="keycap !h-5 !min-w-0 !text-[10px]">Enter</span> to play · Fan-made · Data: PokéAPI · Sprites: PMD Sprite Repository (CC BY-NC) · Not affiliated with Nintendo / Game Freak
        </p>
      </div>

      {rules && <RulesModal onClose={() => { sfx.select(); setRules(false); }} />}
    </div>
  );
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-navy/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="panel rise w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-black">How to play</h2>
        <p className="mt-2 font-semibold text-muted">
          Each round gives you a prompt and 25 seconds. Any Pokémon that fits counts. The fewer trainers who&apos;d think of it, the more it&apos;s worth.
        </p>
        <ul className="mt-4 space-y-2">
          {(["common", "meme", "uncommon", "rare", "ultra", "shiny"] as TierId[]).map((t) => (
            <li key={t} className="flex items-center gap-3 rounded-2xl bg-panel-2/70 px-3 py-2">
              <TierIcon tier={t} scale={3} />
              <span className="flex-1">
                <span className="block font-display font-black" style={{ color: TIERS[t].color }}>{TIERS[t].name}</span>
                <span className="block text-sm font-semibold text-muted">{TIERS[t].blurb}</span>
              </span>
              <span className="font-display text-xl font-black">{TIERS[t].score}</span>
            </li>
          ))}
        </ul>
        <button onClick={onClose} className="tile t-slate stripes mt-5 w-full justify-center py-3 font-display text-lg font-black">Got it</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════ Play ═══════════════════════════ */

type Feedback = { tier: TierId; score: number; pokemon: PokeRef | null; corrected: boolean; raw: string; gaveUp?: boolean };

function NamePlate({ label, color, name, types }: { label: string; color: string; name: string; types?: string[] }) {
  return (
    <div className="plate in inline-block rounded-2xl bg-navy/90 px-5 py-2 text-left shadow-[0_4px_0_rgba(0,0,0,.35)] ring-1 ring-white/10">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color }}>{label}</p>
        <p className="font-display text-[26px] font-black leading-tight">{name}</p>
        {types && types.length > 0 && <div className="mt-1 flex gap-1">{types.map((t) => <TypeChip key={t} type={t} />)}</div>}
      </div>
    </div>
  );
}

function Play({ initial, onFinished }: { initial: RunState; onFinished: (runId: string) => void }) {
  const [state, setState] = useState(initial);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [nextState, setNextState] = useState<RunState | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [badKey, setBadKey] = useState(0);
  const [lineTwo, setLineTwo] = useState(false);
  const [joined, setJoined] = useState(false); // the new catch has joined the party and we walk
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(() => initial.serverNow - Date.now()); // server clock minus ours
  const [skipping, setSkipping] = useState(false);
  const [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  const [panelH, setPanelH] = useState(290);
  const narrow = useNarrow();

  // The world sits above the docked panel, so track its height.
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

  const serverNow = now + offset;
  const phase = !state.answeringOpensAt ? "loading"
    : serverNow < state.answeringOpensAt ? "ready"
    : serverNow < (state.deadline ?? 0) ? "answering" : "timeup";
  const remaining = Math.max(0, (state.deadline ?? 0) - serverNow);
  const secondsLeft = Math.ceil(remaining / 1000);

  useEffect(() => { if (phase === "answering") inputEl?.focus(); }, [phase, inputEl]);
  useEffect(() => { if (phase === "answering" && secondsLeft <= 5 && secondsLeft > 0) sfx.tick(); }, [phase, secondsLeft]);

  function showFeedback(fb: Feedback, s: RunState) {
    setFeedback(fb); setNextState(s); setAnswer(""); setError(null); setLineTwo(false); setJoined(false);
    if (fb.tier === "miss") sfx.miss(); else sfx.catch(fb.tier);
    // Let the Pokémon pop out of the grass first, then it joins the party and everyone walks on.
    if (fb.pokemon) setTimeout(() => setJoined(true), 1500);
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
    adopt(nextState); setFeedback(null); setNextState(null); setJoined(false);
  }

  const shown = nextState ?? state;
  const t = feedback ? TIERS[feedback.tier] : null;
  const walked = feedback && joined && nextState ? nextState : state;
  const party = [buddyFor(state.runId), ...walked.results.filter((r) => r.pokemon).map((r) => r.pokemon!.id)];
  const encounter: Encounter = feedback
    ? (feedback.tier === "miss" ? "miss" : joined ? "gone" : "reveal")
    : phase === "ready" || phase === "loading" ? "rustle" : "idle";

  const readoutTop = narrow ? 112 : 66;

  return (
    <>
      {/* the world, full screen */}
      <div className="fixed inset-0">
        <Trek height="100dvh" meters={walked.score * 10} party={party} encounter={encounter} pokemonId={feedback?.pokemon?.id}
          tier={feedback?.tier} encounterKey={state.round} floor={panelH + 6} readoutTop={readoutTop} />
      </div>

      {/* HUD */}
      <div className="pointer-events-none fixed inset-x-0 top-[62px] z-20 sm:top-[66px]">
        <div className="mx-auto flex max-w-[1100px] items-start justify-between gap-2 px-3">
          <div className="pill !pl-4">
            <span className="whitespace-nowrap font-display text-[15px] font-black">Round {Math.min(state.round + 1, state.rounds)}<span className="text-muted">/{state.rounds}</span></span>
            <span className="ml-1 flex gap-1">
              {Array.from({ length: state.rounds }, (_, i) => {
                const done = shown.results.find((r) => r.round === i);
                return (
                  <span key={i} className={`grid h-6 w-6 place-items-center rounded-lg ${done ? "bg-white/10" : i === state.round && !feedback ? "blink bg-gold/30 ring-2 ring-gold" : "bg-white/5"}`}>
                    {done && <span className="pop-in"><TierIcon tier={done.tier} scale={2} /></span>}
                  </span>
                );
              })}
            </span>
          </div>
          <div className="pill !pl-2">
            <span className="pill-icon !bg-gold/20"><TierIcon tier="shiny" scale={2} /></span>
            <span className="font-display text-lg font-black tabular-nums"><Counter value={shown.score} /></span>
          </div>
        </div>
      </div>

      {/* what just happened, big and centred in the sky */}
      <div className="pointer-events-none fixed inset-x-0 z-20 flex justify-center px-3" style={{ top: readoutTop + 50 }}>
        {feedback && t && !joined && (feedback.pokemon
          ? <NamePlate label={`${t.name} · +${feedback.score}`} color={t.color} name={feedback.pokemon.name} types={feedback.pokemon.types} />
          : <NamePlate label="Got away" color="#a7afd1" name={feedback.gaveUp ? "Skipped" : "Too slow!"} />)}
      </div>

      {/* distance gained floats up from the party */}
      {feedback && joined && feedback.score > 0 && (
        <div key={`m-${state.round}`} className="pointer-events-none fixed z-20 -translate-x-1/2" style={{ left: narrow ? "44%" : "42%", bottom: panelH + 150 }}>
          <span className="rise outlined block whitespace-nowrap text-[34px] text-gold sm:text-[42px]">+{(feedback.score * 10).toLocaleString()} m</span>
        </div>
      )}

      {/* the docked question panel */}
      <div ref={setPanelEl} className="fixed inset-x-0 bottom-0 z-20 px-3 pb-3 sm:pb-5">
        <div key={badKey} className={`panel mx-auto max-w-[720px] p-5 sm:p-6 ${badKey ? "shake" : ""}`}>
        {feedback && t ? (
          <div className="flex min-h-[176px] flex-col">
            <p className="font-display text-[24px] font-black leading-snug sm:text-[28px]">
              <Typewriter
                key={`fb-${state.round}`}
                text={feedback.pokemon
                  ? (feedback.tier === "shiny" ? `Whoa! A shiny ${feedback.pokemon.name}!` : `You found ${feedback.pokemon.name}!`)
                  : feedback.gaveUp ? "You backed away from the grass…"
                  : feedback.raw ? `Too slow! “${feedback.raw}” didn't count.` : "Oh no! It got away…"}
                onDone={() => setLineTwo(true)}
              />
            </p>
            {lineTwo && (
              <div className="rise mt-3 flex flex-wrap items-center gap-3">
                <TierChip tier={feedback.tier} points={false} />
                <span className="outlined text-[30px] leading-none text-gold">+{feedback.score}</span>
                <span className="basis-full font-semibold text-muted">
                  {t.blurb}{feedback.corrected && feedback.pokemon ? ` (read “${feedback.raw}” as ${feedback.pokemon.name})` : ""}
                </span>
              </div>
            )}
            <div className="mt-auto flex justify-end pt-4">
              {lineTwo && (
                <button autoFocus onClick={next} className="tile t-green stripes rise px-6 py-3">
                  <span className="font-display text-xl font-black">{nextState?.completed ? "See results" : "Next round"}</span>
                  <span className="keycap">Enter</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex min-h-[176px] flex-col">
            <p className="text-[12px] font-black uppercase tracking-[0.2em] text-gold">Round {state.round + 1} · {state.label}</p>
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
                placeholder={phase === "answering" ? "Name a Pokémon…" : "Get ready…"}
                autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={40}
                className="h-14 min-w-0 flex-1 rounded-2xl bg-white px-5 text-xl font-extrabold text-navy shadow-[inset_0_-3px_0_rgba(0,0,0,.12)] outline-none ring-4 ring-transparent transition placeholder:text-slate-400 focus:ring-gold/70 disabled:bg-white/50"
              />
              <button type="submit" disabled={busy || phase !== "answering" || !answer.trim()} className="tile t-coral stripes h-14 px-5 py-0">
                <span className="font-display text-xl font-black">{busy ? "…" : "Catch!"}</span>
                <span className="hidden sm:inline"><span className="keycap">Enter</span></span>
              </button>
            </div>
            <div className="mt-auto flex min-h-7 items-end justify-between gap-3 pt-2">
              <p className="font-bold leading-tight text-coral">{error}</p>
              {phase === "answering" && (
                <button type="button" onClick={giveUp} className="shrink-0 text-sm font-extrabold text-muted hover:text-white">Skip round →</button>
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

  useEffect(() => {
    api<ResultsPayload>(`/api/results?runId=${encodeURIComponent(runId)}`)
      .then((d) => { setData(d); sfx.fanfare(); })
      .catch((e) => setError(e.message));
  }, [runId]);

  const best = data?.rounds
    .map((r) => r.yours)
    .filter((y): y is NonNullable<typeof y> => !!y?.pokemon)
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))[0];
  const maxBucket = Math.max(1, ...(data?.stats?.buckets ?? [1]));
  const caught = [buddyFor(runId), ...(data?.rounds ?? []).map((r) => r.yours?.pokemon?.id).filter((id): id is number => !!id)];
  const reached = biomeAt((data?.score ?? 0) * 10);

  const world = (
    <div className="fixed inset-0">
      <Trek height="100dvh" meters={(data?.score ?? 0) * 10} party={caught} replay floorFrac={0.5} readoutTop={66} />
    </div>
  );
  if (error) return <>{world}<div className="relative z-10 mx-auto max-w-lg px-4 pt-28"><div className="panel p-5 font-bold text-coral">{error}</div></div></>;
  if (!data) return <>{world}<div className="relative z-10 mx-auto max-w-lg px-4 pt-28"><div className="panel p-5 font-display text-xl font-black"><span className="blink">Tallying your catches…</span></div></div></>;

  return (
    <>
    {world}
    <div className="relative z-10 mx-auto max-w-[940px] space-y-5 px-3 pb-12">
      {/* leave the top of the screen to the journey replay */}
      <div className="flex items-start justify-center pt-[120px]" style={{ height: "52vh" }}>
        {best?.pokemon && <NamePlate label={`Best catch · ${TIERS[best.tier].name}`} color={TIERS[best.tier].color} name={best.pokemon.name} types={best.pokemon.types} />}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel rise flex flex-col p-5 sm:p-6">
          <p className="text-[12px] font-black uppercase tracking-[0.2em] text-gold">Field report · {data.label}</p>
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
              <span key={i} className="pop-in grid h-10 w-10 place-items-center rounded-xl" style={{ animationDelay: `${250 + i * 120}ms`, background: "rgba(255,255,255,.07)" }}>
                <TierIcon tier={r.yours?.tier ?? "miss"} scale={3} />
              </span>
            ))}
          </div>
          <div className="mt-auto grid grid-cols-3 gap-2 pt-5">
            <button className="tile t-gold stripes justify-center px-2 py-3" onClick={async () => {
              await navigator.clipboard.writeText(`${data.share}\n📍 ${reached.name} · ${(data.score * 10).toLocaleString()} m`); setCopied(true); sfx.select(); setTimeout(() => setCopied(false), 1500);
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
          <p className="mt-2 text-sm font-extrabold text-muted">Your party reached</p>
          <p className="outlined text-[40px] leading-tight text-white">{reached.name}</p>
          <p className="font-display text-xl font-black text-gold">{(data.score * 10).toLocaleString()} m traveled</p>
          <div className="mt-4"><JourneyMap meters={data.score * 10} /></div>
          {data.stats && (
            <div className="mt-5">
              <p className="font-bold">
                {data.stats.betterThan === null
                  ? "You're one of the first trainers out today!"
                  : <>Further than <span className="text-gold">{data.stats.betterThan}%</span> of today&apos;s {data.stats.players.toLocaleString()} trainers</>}
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

      <h2 className="outlined pt-2 text-3xl text-white">Round by round</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {data.rounds.map((r, i) => {
          const tier = r.yours?.tier ?? "miss";
          const labelColor = tier === "miss" ? "#a7afd1" : TIERS[tier].color;
          return (
            <div key={i} className="panel rise overflow-hidden" style={{ animationDelay: `${150 + i * 70}ms` }}>
              <div className="sunburst relative h-40" style={{ "--art": TIER_GRADIENT[tier] } as CSSProperties}>
                <span className="absolute right-3 top-0 font-display text-[64px] font-black leading-none text-white/25">R{i + 1}</span>
                {r.yours?.pokemon ? (
                  <div className="absolute bottom-3 right-6 flex flex-col items-center">
                    <PmdSprite id={r.yours.pokemon.id} height={96} />
                    <div className="-mt-2 h-4 w-24 rounded-[50%] bg-black/20" />
                  </div>
                ) : (
                  <div className="absolute bottom-6 right-8"><TierIcon tier="miss" scale={8} /></div>
                )}
                <div className="plate absolute bottom-3 left-3 rounded-xl bg-navy/90 px-3 py-1.5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: labelColor }}>
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
                    <span className="flex h-12 w-12 items-end justify-center overflow-hidden"><PmdSprite id={r.shiny.id} height={44} /></span>
                    <span className="text-sm font-bold text-muted">The Shiny was <span className="font-black text-gold">{r.shiny.name}</span></span>
                  </div>
                )}
                <div className="space-y-1.5 text-[14px]">
                  {(["common", "uncommon", "rare", "ultra"] as TierId[]).map((tr) => (r.examples[tr]?.length ? (
                    <div key={tr} className="flex items-start gap-2">
                      <TierIcon tier={tr} scale={2} className="mt-0.5 shrink-0" />
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
