"use client";

import { useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/sfx";

// Types text out letter by letter with a soft blip, like an RPG text box.
// Remount it (change `key`) to type new text. Click to finish instantly.
export function Typewriter({ text, speed = 24, onDone, sound = true, className }: {
  text: string; speed?: number; onDone?: () => void; sound?: boolean; className?: string;
}) {
  const [shown, setShown] = useState(0);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; });

  useEffect(() => {
    if (shown >= text.length) { onDoneRef.current?.(); return; }
    const t = setTimeout(() => {
      setShown((n) => n + 1);
      if (sound && shown % 3 === 0 && text[shown] !== " ") sfx.blip();
    }, speed);
    return () => clearTimeout(t);
  }, [shown, text, speed, sound]);

  return (
    <span className={className} onClick={() => setShown(text.length)}>
      {text.slice(0, shown)}
      <span className="invisible">{text.slice(shown)}</span>
    </span>
  );
}
