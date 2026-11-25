"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from "react";
import { METERS_PER_POINT, ROUND_MS, TIERS, formatMeters, metersFor, type TierId } from "@/lib/game";
import type { PokeRef, GuessResult, ResultsPayload, RunState } from "@/lib/api-types";
import { isMuted, setMuted, sfx, subscribeMuted } from "@/lib/sfx";
import { TIER_GRADIENT, TierIcon, TimerBar, PixelArt } from "./pixel";
import { Scene, type Mon, type Outcome, type SceneHandle } from "./Scene";
import { JourneyMap, StadiumBg, stratumAt, stratumIndexAt } from "./World";
import { padArt } from "./art";
import { BALLS, BALL_FOR_TIER, BallIcon, MonIcon, Sprite } from "./sprites";

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
const useHeight = () => useSyncExternalStore(subscribeResize, () => window.innerHeight, () => 800);
const TIER_ORDER: TierId[] = ["shiny", "ultra", "rare", "uncommon", "meme", "common", "miss"];
const tierMeters = (t: TierId) => TIERS[t].score * METERS_PER_POINT;

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
          <div className="fixed inset-0"><Scene floor={0} partner={PIKACHU} outcome={null} roundKey="title" layout="title" /></div>
          <div className="pointer-events-none fixed inset-0 bg-gradient-to-r from-navy/75 via-navy/15 to-transparent" />
        </>
      )}

      <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-2 p-3 sm:p-4">
        <button className="pill pointer-events-auto" onClick={() => { if (!onTitle) { sfx.select(); void go({ name: "title" }); } }}>
          <span className="pill-icon"><BallIcon ball="poke-ball" size={26} /></span>Tall Grass
        </button>
        <button className="pill pointer-events-auto" onClick={() => { setMuted(!muted); if (muted) sfx.select(); }} aria-label="Toggle sound">
          <span className="pill-icon text-sm">{muted ? "🔇" : "🔊"}</span><span className="hidden sm:inline">{muted ? "Sound off" : "Sound on"}</span>
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
            Something&apos;s in the grass. Name the Pokémon nobody else thinks of, and dig deeper than anyone.
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
              <span className="block text-[13px] font-bold opacity-90">Balls &amp; depth</span>
            </span>
          </button>
        </div>
        {error && <p className="panel px-4 py-3 font-bold text-coral">{error}</p>}

        <p className="text-xs font-bold text-white/75 [text-shadow:0_1px_0_rgba(0,0,0,.6)]">
          Press <span className="keycap !h-5 !min-w-0 !text-[10px]">Enter</span> to play · Fan-made · Data: PokéAPI · Sprites &amp; battle backgrounds: Pokémon Showdown / Smogon Sprite Project · Not affiliated with Nintendo / Game Freak
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
          Something rustles in the grass and you get a prompt and 25 seconds. Name any Pokémon that fits and it pops out
          (misspell it and we&apos;ll ask what you meant).
          Catch it and it drops down the shaft, smashing through one ledge for every tier it beats.
          The fewer trainers who&apos;d think of it, the deeper it digs, and the better the ball it lands in.
        </p>
        <ul className="mt-4 space-y-2">
          {(["common", "meme", "uncommon", "rare", "ultra", "shiny"] as TierId[]).map((t) => (
            <li key={t} className="flex items-center gap-3 rounded-2xl bg-panel-2/70 px-3 py-2">
              <BallIcon ball={BALL_FOR_TIER[t]} size={40} />
              <span className="flex-1">
                <span className="block font-display font-black" style={{ color: TIERS[t].color }}>{TIERS[t].name} <span className="font-body text-sm text-muted">· {BALLS[BALL_FOR_TIER[t]].name}</span></span>
                <span className="block text-sm font-semibold text-muted">{TIERS[t].blurb}</span>
              </span>
              <span className="whitespace-nowrap font-display text-lg font-black">+{tierMeters(t).toLocaleString()} m</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm font-semibold text-muted">Each prompt hides one Shiny, today&apos;s hidden gem. You won&apos;t know you found it until it hits the bottom.</p>
        <button onClick={onClose} className="tile t-slate stripes mt-5 w-full justify-center py-3 font-display text-lg font-black">Got it</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════ Play ═══════════════════════════ */

type Feedback =
  | { kind: "catch"; tier: TierId; pokemon: PokeRef; raw: string }
  | { kind: "miss"; raw: string; gaveUp?: boolean };

function Play({ initial, onFinished }: { initial: RunState; onFinished: (runId: string) => void }) {
  const [state, setState] = useState(initial);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [nextState, setNextState] = useState<RunState | null>(null);
  const [settled, setSettled] = useState(false); // the catch has landed; the result panel is up
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<{ typed: string; options: PokeRef[] } | null>(null); // "Did you mean…?"
  const [busy, setBusy] = useState(false);
  const [badKey, setBadKey] = useState(0);
  const [typing, setTyping] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(() => initial.serverNow - Date.now()); // server clock minus ours
  const [shownAt, setShownAt] = useState(() => Date.now()); // when this round's prompt appeared
  const [stoppedAt, setStoppedAt] = useState<number | null>(null); // the clock freezes once you've answered
  const [skipping, setSkipping] = useState(false);
  const [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  const [panelH, setPanelH] = useState(250);
  const startReq = useRef<Promise<unknown> | null>(null);
  const sceneRef = useRef<SceneHandle>(null);
  const width = useWidth();
  const narrow = width < 640;

  // The scene sits above the docked answer panel, so track its height (while it shows the form).
  // A "Did you mean…?" row can briefly make the panel taller; the scene holds still for it.
  useLayoutEffect(() => {
    if (!panelEl || feedback || suggest) return;
    const ro = new ResizeObserver(() => setPanelH(panelEl.offsetHeight));
    ro.observe(panelEl);
    return () => ro.disconnect();
  }, [panelEl, feedback, suggest]);

  const adopt = (s: RunState) => { setOffset(s.serverNow - Date.now()); setState(s); };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);

  // Start the round's clock on the server. You can already type: a guess waits for this.
  useEffect(() => {
    if (feedback || state.completed || state.answeringOpensAt) return;
    let cancelled = false;
    startReq.current = api<RunState>("/api/round", { runId: state.runId, action: "start" })
      .then((s) => { if (!cancelled) adopt(s); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    sfx.rustle();
    return () => { cancelled = true; };
  }, [state.runId, state.round, state.answeringOpensAt, state.completed, feedback]);

  const serverNow = (stoppedAt ?? now) + offset;
  const deadline = state.deadline ?? shownAt + offset + ROUND_MS;
  const phase = feedback ? "result" : serverNow < deadline ? "answering" : "timeup";
  const remaining = Math.max(0, deadline - serverNow);
  const secondsLeft = Math.ceil(remaining / 1000);
  const urgent = phase === "answering" && remaining < 5_000;

  useEffect(() => { if (phase === "answering") inputEl?.focus(); }, [phase, inputEl]);
  useEffect(() => { if (phase === "answering" && secondsLeft <= 5 && secondsLeft > 0) sfx.tick(); }, [phase, secondsLeft]);

  // `s` has just arrived, so its server time is fresh: sync the clock offset now (not later, when it's stale).
  function show(fb: Feedback, s: RunState) {
    setOffset(s.serverNow - Date.now());
    setFeedback(fb); setNextState(s); setSettled(false); setError(null); setSuggest(null); setStoppedAt(Date.now());
  }

  // Out of time: the round is a miss (unless a last-second guess is still in flight).
  useEffect(() => {
    if (phase !== "timeup" || feedback || busy || skipping) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSkipping(true);
    api<RunState>("/api/round", { runId: state.runId, action: "skip" })
      .then((s) => { if (!cancelled) show({ kind: "miss", raw: answer.trim() }, s); })
      .catch((e) => setError(e.message))
      .finally(() => setSkipping(false));
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, feedback, busy]);

  const inFlight = feedback?.kind === "catch" && !settled;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight) { sceneRef.current?.skip(); return; }
    // Enter while "Did you mean…?" is up takes the first suggestion.
    if (suggest) pick(suggest.options[0]);
    else void guess(answer);
  }

  function pick(p: PokeRef) {
    setAnswer(p.name);
    void guess(p.name);
  }

  function dismissSuggest() {
    setSuggest(null);
    requestAnimationFrame(() => inputEl?.select());
  }

  async function guess(typed: string) {
    if (busy || phase !== "answering" || !typed.trim()) return;
    setBusy(true); setError(null); setSuggest(null);
    sfx.burst();
    try {
      await startReq.current;
      const r = await api<GuessResult>("/api/guess", { runId: state.runId, answer: typed });
      if (r.status === "rejected") {
        setError(r.reason); setBadKey((k) => k + 1); sfx.wrong();
        requestAnimationFrame(() => inputEl?.select());
      } else if (r.status === "suggest") {
        setSuggest({ typed: r.typed, options: r.options }); sfx.hmm();
        requestAnimationFrame(() => inputEl?.focus());
      } else if (r.status === "accepted") {
        show({ kind: "catch", tier: r.tier, pokemon: r.pokemon, raw: typed }, r.state);
      } else {
        show({ kind: "miss", raw: typed }, r.state);
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
      await startReq.current;
      const s = await api<RunState>("/api/round", { runId: state.runId, action: "skip" });
      show({ kind: "miss", raw: "", gaveUp: true }, s);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  function next() {
    if (!nextState) return;
    sfx.select();
    if (nextState.completed) { onFinished(nextState.runId); return; }
    setState(nextState); setFeedback(null); setNextState(null); setSettled(false);
    setAnswer(""); setError(null); setSuggest(null); setShownAt(Date.now()); setStoppedAt(null);
  }

  const onSettled = useCallback(() => setSettled(true), []);
  const outcome = useMemo<Outcome | null>(() => {
    if (!feedback || !nextState) return null;
    if (feedback.kind === "miss") return { kind: "miss" };
    const p = feedback.pokemon;
    return { kind: "catch", tier: feedback.tier, mon: { id: p.id, name: p.name, types: p.types }, target: metersFor(nextState.score) };
  }, [feedback, nextState]);
  const lastCatch = useMemo(() => [...state.results].reverse().find((r) => r.pokemon), [state.results]);
  const partner = useMemo<Mon>(() => (lastCatch?.pokemon
    ? { id: lastCatch.pokemon.id, name: lastCatch.pokemon.name, types: lastCatch.pokemon.types, shiny: lastCatch.tier === "shiny" }
    : buddyFor(state.runId)), [lastCatch, state.runId]);

  // Ball slots fill in once the ball has landed.
  const applied = settled && nextState ? nextState : state;
  const hudTop = narrow ? 104 : 112;
  const showResult = !!feedback && (settled || feedback.kind === "miss");

  return (
    <>
      <div className="fixed inset-0" onClick={inFlight ? () => sceneRef.current?.skip() : undefined}>
        <Scene ref={sceneRef} floor={metersFor(state.score)} partner={partner} outcome={outcome} roundKey={state.round}
          pending={busy && !feedback} typing={typing} urgent={urgent}
          bottom={panelH + 8} top={hudTop} hud onSettled={onSettled} />
      </div>

      {/* HUD: round and the ball each catch landed in */}
      <div className="pointer-events-none fixed left-0 top-[60px] z-20 px-3 sm:top-[66px]">
        <div className="pill !h-11 !pl-4">
          <span className="whitespace-nowrap font-display text-[15px] font-black">
            <span className="hidden sm:inline">Round </span>{Math.min(state.round + 1, state.rounds)}<span className="text-muted">/{state.rounds}</span>
          </span>
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
          {state.mode === "practice" && <span className="ml-1 hidden rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-muted sm:inline">Practice</span>}
        </div>
      </div>

      {/* the docked panel: the prompt while you answer, then the result (it ducks out of the way during the fall) */}
      <div ref={setPanelEl} className={`fixed inset-x-0 bottom-0 z-20 px-3 pb-3 transition-transform duration-300 ease-out sm:pb-5 ${inFlight ? "translate-y-[115%]" : ""}`}>
        <div key={badKey} className={`panel mx-auto max-w-[720px] p-5 sm:p-6 ${badKey ? "shake" : ""}`}>
          {showResult && feedback ? (
            <ResultView feedback={feedback} last={!!nextState?.completed} onNext={next} />
          ) : (
            <form onSubmit={submit} className="flex flex-col">
              <p key={`p-${state.round}`} className="rise min-h-[1.3em] font-display text-[22px] font-black leading-snug sm:text-[28px]">{state.prompt?.text}</p>
              <div className="mt-3">
                <TimerBar value={remaining / ROUND_MS} seconds={secondsLeft} low={remaining < 5_000} />
              </div>
              <div className="mt-4 flex gap-2">
                <input
                  ref={setInputEl}
                  value={answer}
                  onChange={(e) => { setAnswer(e.target.value); setTyping((t) => t + 1); if (error) setError(null); if (suggest) setSuggest(null); }}
                  onKeyDown={(e) => { if (e.key === "Escape" && suggest) { e.preventDefault(); dismissSuggest(); } }}
                  readOnly={phase !== "answering" || busy}
                  placeholder="Name a Pokémon…"
                  autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={40} enterKeyHint="send"
                  className="h-14 min-w-0 flex-1 rounded-2xl bg-white px-5 text-xl font-extrabold text-navy shadow-[inset_0_-3px_0_rgba(0,0,0,.12)] outline-none ring-4 ring-transparent transition placeholder:text-slate-400 focus:ring-gold/70"
                />
                <button type="submit" disabled={phase !== "answering" || (!answer.trim() && !busy)} className="tile t-coral stripes h-14 gap-2 px-4 py-0">
                  <BallIcon ball="poke-ball" size={30} className={busy ? "spinning" : ""} />
                  <span className="hidden font-display text-xl font-black min-[400px]:inline">Throw!</span>
                </button>
              </div>
              <div className="mt-2 flex min-h-9 items-center justify-between gap-3">
                {suggest && phase === "answering" ? (
                  <div key={suggest.typed} className="rise flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <span className="font-bold text-muted">Did you mean</span>
                    {suggest.options.map((p, i) => (
                      <button key={p.id} type="button" onClick={() => pick(p)} disabled={busy} className={`suggest ${i === 0 ? "main" : ""}`}>
                        <MonIcon id={p.id} name={p.name} size={30} />
                        <span>{p.name}{i === suggest.options.length - 1 ? "?" : ""}</span>
                        {i === 0 && !narrow && <span className="keycap">Enter</span>}
                      </button>
                    ))}
                    {!busy && (
                      <button type="button" onClick={dismissSuggest} title="Esc" className="ml-auto px-1 text-sm font-extrabold text-muted hover:text-white">
                        No
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="font-bold leading-tight text-coral">{error}</p>
                    {phase === "answering" && !busy && (
                      <button type="button" onClick={giveUp} className="shrink-0 text-sm font-extrabold text-muted hover:text-white">Run away →</button>
                    )}
                  </>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

function ResultView({ feedback, last, onNext }: { feedback: Feedback; last: boolean; onNext: () => void }) {
  const caught = feedback.kind === "catch" ? feedback : null;
  const tier: TierId = caught ? caught.tier : "miss";
  const t = TIERS[tier];
  const missLine = feedback.kind === "miss"
    ? (feedback.gaveUp ? "You ran away." : feedback.raw ? `Too slow! “${feedback.raw}” didn't count.` : "It got away…")
    : "";
  return (
    <div className="flex flex-col">
      <div className="rise flex items-center gap-3 sm:gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white/10 ring-2 ring-white/15">
          {caught ? <BallIcon ball={BALL_FOR_TIER[tier]} size={54} className="pop-in" /> : <TierIcon tier="miss" scale={4} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[22px] font-black leading-tight sm:text-[28px]">
            {caught ? (tier === "shiny" ? `Shiny ${caught.pokemon.name}!` : caught.pokemon.name) : missLine}
          </p>
          <p className="text-[14px] font-bold leading-snug text-muted sm:text-[15px]">
            {caught ? <><span className="font-black" style={{ color: t.color }}>{t.name}</span> · {t.blurb}</> : "No catch, no digging this round."}
          </p>
        </div>
        {caught && <span className="outlined shrink-0 whitespace-nowrap text-[26px] leading-none text-gold sm:text-[34px]">+{tierMeters(tier).toLocaleString()} m</span>}
      </div>
      <div className="mt-4 flex justify-end">
        <button autoFocus onClick={(e) => { e.stopPropagation(); onNext(); }} className="tile t-green stripes rise px-6 py-3">
          <span className="font-display text-xl font-black">{last ? "See your team" : "Next encounter"}</span>
          <span className="keycap">Enter</span>
        </button>
      </div>
    </div>
  );
}

// Number that counts up instead of jumping.
function Counter({ value, format = (n: number) => String(n) }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (shown === value) return;
    const step = Math.max(1, Math.round(Math.abs(value - shown) / 12));
    const t = setTimeout(() => setShown((s) => (s < value ? Math.min(value, s + step) : Math.max(value, s - step))), 30);
    return () => clearTimeout(t);
  }, [shown, value]);
  return <>{format(shown)}</>;
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
  const height = useHeight();

  useEffect(() => {
    api<ResultsPayload>(`/api/results?runId=${encodeURIComponent(runId)}`)
      .then((d) => { setData(d); sfx.fanfare(); })
      .catch((e) => setError(e.message));
  }, [runId]);

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

  const meters = metersFor(data?.score ?? 0);
  const reached = stratumAt(meters);
  const si = stratumIndexAt(meters);
  const maxBucket = Math.max(1, ...(data?.stats?.buckets ?? [1]));

  const world = (
    <div className="fixed inset-0 bg-navy">
      {/* the stadium you finished in */}
      <StadiumBg D={meters} w={width} h={height} className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-b from-navy/50 via-navy/20 to-navy/90" />
    </div>
  );
  if (error) return <>{world}<div className="relative z-10 mx-auto max-w-lg px-4 pt-28"><div className="panel p-5 font-bold text-coral">{error}</div></div></>;
  if (!data) return <>{world}<div className="relative z-10 mx-auto max-w-lg px-4 pt-28"><div className="panel p-5 font-display text-xl font-black"><span className="blink">Tallying your catches…</span></div></div></>;

  const best = data.rounds.map((r) => r.yours).filter((y): y is NonNullable<typeof y> => !!y?.pokemon)
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))[0];
  const segments = data.rounds.filter((r) => r.yours?.pokemon).map((r) => ({ meters: tierMeters(r.yours!.tier), color: TIERS[r.yours!.tier].color }));

  return (
    <>
      {world}
      <div className="relative z-10 mx-auto max-w-[1040px] space-y-6 px-3 pb-14 pt-[84px] sm:pt-24">
        <div className="text-center">
          <p className="text-[12px] font-black uppercase tracking-[0.25em] text-gold">Field report · {data.label}</p>
          <h1 className="outlined text-[44px] leading-tight text-white sm:text-[56px]">Your team</h1>
          <p className="font-display text-lg font-black text-white/85 [text-shadow:0_2px_0_rgba(20,26,51,.8)]">
            Dug down to {reached.name} · {formatMeters(meters)} deep
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
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2"><PixelArt art={padArt(si, meters === 0)} scale={2} /></div>
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
                    <span className="text-[12px] font-black" style={{ color: tier === "miss" ? "#a7afd1" : TIERS[tier].color }}>{tier === "miss" ? "No catch" : `${TIERS[tier].name} · +${tierMeters(tier).toLocaleString()} m`}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="panel rise flex flex-col p-5 sm:p-6">
            <p className="text-[12px] font-black uppercase tracking-[0.2em] text-gold">Depth</p>
            <div className="mt-2 flex flex-wrap items-end gap-x-2">
              <span className="outlined text-[64px] leading-[.9] text-white sm:text-[72px]"><Counter value={meters} format={(n) => n.toLocaleString()} /><span className="text-[40px]"> m</span></span>
              <span className="mb-2 font-display text-xl font-black text-muted">/ {metersFor(data.maxScore).toLocaleString()} m</span>
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
              <p className="mt-4 font-bold text-muted">Deepest catch: <span className="font-black text-white">{best.pokemon.name}</span> <span style={{ color: TIERS[best.tier].color }}>({TIERS[best.tier].name}, +{tierMeters(best.tier).toLocaleString()} m)</span></p>
            )}
            <div className="mt-auto grid grid-cols-3 gap-2 pt-5">
              <button className="tile t-gold stripes justify-center px-2 py-3" onClick={async () => {
                await navigator.clipboard.writeText(`${data.share}\n📍 ${reached.name}`); setCopied(true); sfx.select(); setTimeout(() => setCopied(false), 1500);
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
            <p className="mt-2 text-sm font-extrabold text-muted">You dug down to</p>
            <p className="outlined text-[40px] leading-tight text-white">{reached.name}</p>
            <p className="font-display text-lg font-black text-white/70">{reached.flavor}</p>
            <div className="mt-4"><JourneyMap meters={meters} segments={segments} /></div>
            {data.stats && (
              <div className="mt-5">
                <p className="font-bold">
                  {data.stats.betterThan === null
                    ? "You're one of the first trainers down today!"
                    : <>Deeper than <span className="text-gold">{data.stats.betterThan}%</span> of today&apos;s {data.stats.players.toLocaleString()} trainers</>}
                </p>
                <div className="mt-2 flex h-14 items-end gap-1">
                  {data.stats.buckets.map((n, b) => (
                    <div key={b} className="flex-1 rounded-t-md" title={`${(b * 500).toLocaleString()}–${(b * 500 + 499).toLocaleString()} m: ${n}`}
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
                        {tier === "miss" ? TIERS[tier].name : `${TIERS[tier].name} · +${tierMeters(tier).toLocaleString()} m`}
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
