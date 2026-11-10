import { fingerprint } from "./model";
import type { PNode } from "./parse";
import type { Block, Doc, MarkdownSnapshot, SnapshotNode } from "./types";

/** A block of the previous version: id, type and matching key (source slice or fingerprint). */
export interface PrevNode {
  id: string;
  type: string;
  key: string;
  children: PrevNode[];
}

export function prevFromSnapshot(snap: MarkdownSnapshot): PrevNode[] {
  const fromTree = (n: SnapshotNode, origin: number): PrevNode => ({
    id: n.id,
    type: n.type,
    key: snap.text.slice(origin + n.start, origin + n.end),
    children: n.children.map((c) => fromTree(c, origin)),
  });
  return snap.blocks.map((b) =>
    b.tree
      ? fromTree(b.tree, b.start)
      : { id: b.id, type: b.type, key: snap.text.slice(b.start, b.end), children: [] },
  );
}

export function prevFromDoc(doc: Doc): PrevNode[] {
  const from = (b: Block): PrevNode => ({
    id: b.id,
    type: b.type,
    key: fingerprint(b),
    children: (b.children ?? []).map(from),
  });
  return (doc.blocks ?? []).map(from);
}

function collectIds(nodes: PrevNode[], out: Set<string>): Set<string> {
  for (const n of nodes) {
    out.add(n.id);
    collectIds(n.children, out);
  }
  return out;
}

/** Longest common subsequence pairs `[i, j]` (increasing) of two key lists. */
export function lcsPairs(a: string[], b: string[]): [number, number][] {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (
    suf < a.length - pre &&
    suf < b.length - pre &&
    a[a.length - 1 - suf] === b[b.length - 1 - suf]
  )
    suf++;
  const res: [number, number][] = [];
  for (let i = 0; i < pre; i++) res.push([i, i]);
  const A = a.slice(pre, a.length - suf);
  const B = b.slice(pre, b.length - suf);
  const n = A.length;
  const m = B.length;
  if (n > 0 && m > 0) {
    if (n * m <= 4_000_000) {
      const w = m + 1;
      const dp = new Uint32Array((n + 1) * w);
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          dp[i * w + j] =
            A[i] === B[j]
              ? dp[(i + 1) * w + j + 1]! + 1
              : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
        }
      }
      let i = 0;
      let j = 0;
      while (i < n && j < m) {
        if (A[i] === B[j]) {
          res.push([i + pre, j + pre]);
          i++;
          j++;
        } else if (dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!) i++;
        else j++;
      }
    } else {
      // Large inputs: greedy in-order matching of keys.
      const positions = new Map<string, number[]>();
      B.forEach((k, j) => {
        const list = positions.get(k);
        if (list) list.push(j);
        else positions.set(k, [j]);
      });
      let lastJ = -1;
      for (let i = 0; i < n; i++) {
        const list = positions.get(A[i]!);
        if (!list) continue;
        const j = list.find((x) => x > lastJ);
        if (j === undefined) continue;
        res.push([i + pre, j + pre]);
        lastJ = j;
      }
    }
  }
  for (let t = 0; t < suf; t++) res.push([a.length - suf + t, b.length - suf + t]);
  return res;
}

/**
 * Assign ids to freshly parsed nodes. With previous nodes: identical keys are matched
 * in order (LCS); nodes between matched neighbours are paired 1:1 by position
 * (equal-length runs) or by equal type from both ends of the run; paired nodes inherit
 * the previous id and their children are matched recursively. Others get new ids.
 */
export function assignIds(
  nodes: PNode[],
  prev: PrevNode[] | null,
  keyOf: (n: PNode) => string,
  createId: () => string,
): void {
  const reserved = prev ? collectIds(prev, new Set()) : new Set<string>();
  const taken = new Set<string>();
  const fresh = (): string => {
    let id = createId();
    for (let tries = 0; tries < 100 && (taken.has(id) || reserved.has(id) || id === ""); tries++) {
      id = createId();
    }
    if (typeof id !== "string" || !id || taken.has(id) || reserved.has(id))
      throw new Error("Markdown createId must produce unique non-empty IDs");
    taken.add(id);
    return id;
  };
  const run = (ns: PNode[], ps: PrevNode[] | null): void => {
    if (!ps || ps.length === 0) {
      for (const n of ns) {
        n.block.id = fresh();
        run(n.children, null);
      }
      return;
    }
    const pairs = lcsPairs(
      ns.map((n) => keyOf(n)),
      ps.map((p) => p.key),
    );
    const paired = new Map<number, number>();
    let pi = 0;
    let pj = 0;
    const flush = (i: number, j: number): void => {
      const gn = i - pi;
      const gp = j - pj;
      if (gn === gp) {
        for (let t = 0; t < gn; t++) paired.set(pi + t, pj + t);
      } else {
        let a = 0;
        while (a < gn && a < gp && ns[pi + a]!.block.type === ps[pj + a]!.type) {
          paired.set(pi + a, pj + a);
          a++;
        }
        let z = 0;
        while (z < gn - a && z < gp - a && ns[i - 1 - z]!.block.type === ps[j - 1 - z]!.type) {
          paired.set(i - 1 - z, j - 1 - z);
          z++;
        }
      }
    };
    for (const [i, j] of pairs) {
      flush(i, j);
      paired.set(i, j);
      pi = i + 1;
      pj = j + 1;
    }
    flush(ns.length, ps.length);
    ns.forEach((n, i) => {
      const j = paired.get(i);
      const p = j !== undefined ? ps[j] : undefined;
      if (p?.id && !taken.has(p.id)) {
        n.block.id = p.id;
        taken.add(p.id);
        run(n.children, p.children);
      } else {
        n.block.id = fresh();
        run(n.children, null);
      }
    });
  };
  run(nodes, prev);
}
