import type { SlashCommandDef } from "@gotipe/core";
import type React from "react";

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.startsWith(q)) return 100; // exact prefix
  if (t.includes(q)) return 80; // substring
  // character-by-character fuzzy
  let qi = 0;
  let score = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 10;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

export function scoreCommand(query: string, cmd: SlashCommandDef): number {
  if (!query) return 100;
  const nameScore = fuzzyScore(query, cmd.name);
  const aliasScore = Math.max(0, ...cmd.aliases.map((a) => fuzzyScore(query, a)));
  // exact prefix on name wins, then alias match, then fuzzy substring
  return Math.max(nameScore, aliasScore * 0.9);
}

/* ------------------------------------------------------------------ */
/*  Highlight matching chars with <mark>                              */
/* ------------------------------------------------------------------ */

export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx !== -1) {
    return (
      <>
        {text.slice(0, idx)}
        <mark>{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  }
  // character-by-character highlight
  const chars: React.ReactNode[] = [];
  let qi = 0;
  for (let i = 0; i < text.length; i++) {
    if (qi < q.length && t[i] === q[qi]) {
      chars.push(<mark key={i}>{text[i]}</mark>);
      qi++;
    } else {
      chars.push(text[i]);
    }
  }
  return <>{chars}</>;
}
