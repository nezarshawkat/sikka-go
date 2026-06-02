import type { Edge, GraphNode, ModeKey, TransitGraph } from "./types.js";
import type { PlanProfile } from "./cost.js";
import { WALK_MAX_SINGLE_MIN, WALK_MAX_TOTAL_MIN } from "./cost.js";

export interface SearchOverlay {
  nodes: Map<string, GraphNode>;
  edges: Map<string, Edge[]>;
}

export interface SearchResult {
  nodeIds: string[];
  edges: Edge[];
  weight: number;
}

class MinHeap<T> {
  private items: { p: number; v: T }[] = [];
  get size() {
    return this.items.length;
  }
  push(p: number, v: T) {
    const a = this.items;
    a.push({ p, v });
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].p <= a[i].p) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop(): T | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let s = i;
        if (l < a.length && a[l].p < a[s].p) s = l;
        if (r < a.length && a[r].p < a[s].p) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]];
        i = s;
      }
    }
    return top.v;
  }
}

function edgeWeight(e: Edge, profile: PlanProfile): number {
  // Enforce a strict minimum floor for time weights to protect economic routing profiles from meandering loops
  const baselineTimeW = Math.max(0.4, profile.timeW);

  let w =
    baselineTimeW * e.timeMin +
    profile.costW * e.costEgp +
    profile.walkW * e.walkMin +
    (e.isBoarding ? profile.transferPenalty : 0);

  // Apply a dynamic compounding penalty for lengthy rides on informal modes
  if (e.kind === "ride" && (e.mode === "microbus" || e.mode === "serfis")) {
    if (e.timeMin > 12) {
      w += (e.timeMin - 12) * 0.55;
    }
  }

  if (e.isBoarding) w *= profile.modePref[e.mode] ?? 1;
  return w;
}

const MAX_SINGLE_WALK_MIN = WALK_MAX_SINGLE_MIN;
const MAX_TOTAL_WALK_MIN = WALK_MAX_TOTAL_MIN;

const CONNECTOR_MODES: Set<ModeKey> = new Set(["walk", "taxi", "tuktuk"]);

interface Label {
  node: string;
  weight: number;
  walk: number;
  cwalk: number;
  prev: Label | null;
  edge: Edge | null;
  alive: boolean;
}

export function findRoute(
  graph: TransitGraph,
  overlay: SearchOverlay,
  start: string,
  goal: string,
  profile: PlanProfile,
  allowed: Set<ModeKey>,
): SearchResult | null {
  const labelsByNode = new Map<string, Label[]>();
  const heap = new MinHeap<Label>();

  const neighbors = (id: string): Edge[] => {
    const base = graph.edges.get(id) ?? [];
    const extra = overlay.edges.get(id) ?? [];
    return extra.length ? base.concat(extra) : base;
  };

  const addLabel = (
    node: string, weight: number, walk: number, cwalk: number,
    prev: Label | null, edge: Edge | null,
  ): void => {
    const existing = labelsByNode.get(node);
    if (existing) {
      for (const l of existing) {
        if (l.alive && l.weight <= weight && l.walk <= walk && l.cwalk <= cwalk) return;
      }
      for (const l of existing) {
        if (l.alive && l.weight >= weight && l.walk >= walk && l.cwalk >= cwalk) l.alive = false;
      }
    }
    const lab: Label = { node, weight, walk, cwalk, prev, edge, alive: true };
    if (existing) existing.push(lab);
    else labelsByNode.set(node, [lab]);
    heap.push(weight, lab);
  };

  addLabel(start, 0, 0, 0, null, null);

  let goalLabel: Label | null = null;
  while (heap.size > 0) {
    const lab = heap.pop()!;
    if (!lab.alive) continue;
    if (lab.node === goal) {
      goalLabel = lab;
      break;
    }
    for (const e of neighbors(lab.node)) {
      if (!CONNECTOR_MODES.has(e.mode) && !allowed.has(e.mode)) continue;
      const isWalk = e.kind === "walk";

      const nextCwalk = isWalk ? lab.cwalk + (e.walkMin || 0) : 0;
      if (isWalk && nextCwalk > MAX_SINGLE_WALK_MIN) continue;
      const nextWalk = lab.walk + (e.walkMin || 0);
      if (e.walkMin > 0 && nextWalk > MAX_TOTAL_WALK_MIN) continue;

      addLabel(e.to, lab.weight + edgeWeight(e, profile), nextWalk, nextCwalk, lab, e);
    }
  }

  if (!goalLabel) return null;

  const nodeIds: string[] = [];
  const edges: Edge[] = [];
  let cur: Label | null = goalLabel;
  while (cur && cur.prev) {
    nodeIds.push(cur.node);
    edges.push(cur.edge!);
    cur = cur.prev;
  }
  nodeIds.push(start);
  nodeIds.reverse();
  edges.reverse();
  return { nodeIds, edges, weight: goalLabel.weight };
}
