import type { Edge, GraphNode, ModeKey, TransitGraph } from "./types.js";
import type { PlanProfile } from "./cost.js";

export interface SearchOverlay {
  nodes: Map<string, GraphNode>;
  edges: Map<string, Edge[]>;
}

export interface SearchResult {
  nodeIds: string[];
  edges: Edge[]; // edges[i] connects nodeIds[i] -> nodeIds[i+1]
  weight: number;
}

// Minimal binary min-heap keyed by numeric priority.
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
  let w =
    profile.timeW * e.timeMin +
    profile.costW * e.costEgp +
    profile.walkW * e.walkMin +
    (e.isBoarding ? profile.transferPenalty : 0);
  if (e.isBoarding) w *= profile.modePref[e.mode] ?? 1;
  return w;
}

const MAX_SINGLE_WALK_MIN = 20; // spec: max single walking segment
const MAX_TOTAL_WALK_MIN = 30; // spec: max total walking across the journey

// A search label = one Pareto-optimal way to reach a node, tracked by both its
// accumulated weight and its accumulated walking (the constrained resource).
interface Label {
  node: string;
  weight: number;
  walk: number;
  prev: Label | null;
  edge: Edge | null;
  alive: boolean; // cleared when a strictly-better label dominates it
}

// Deterministic least-weight search over a resource-constrained graph. No AI,
// no guessing. Total walking is a hard budget, and because it is path-dependent
// a plain one-label-per-node Dijkstra can discard a feasible low-walk path in
// favour of a cheaper high-walk one that later breaks the cap. We therefore
// keep, per node, the full Pareto frontier of non-dominated (weight, walk)
// labels — a label (w,k) dominates (w',k') iff w<=w' AND k<=k'. This is exact:
// no feasible cheapest route is ever pruned, and none is ever invented.
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

  // Insert a candidate label unless an existing one dominates it; if accepted,
  // retire any existing labels it now dominates.
  const addLabel = (
    node: string, weight: number, walk: number, prev: Label | null, edge: Edge | null,
  ): void => {
    const existing = labelsByNode.get(node);
    if (existing) {
      for (const l of existing) {
        if (l.alive && l.weight <= weight && l.walk <= walk) return; // dominated
      }
      for (const l of existing) {
        if (l.alive && l.weight >= weight && l.walk >= walk) l.alive = false;
      }
    }
    const lab: Label = { node, weight, walk, prev, edge, alive: true };
    if (existing) existing.push(lab);
    else labelsByNode.set(node, [lab]);
    heap.push(weight, lab);
  };

  addLabel(start, 0, 0, null, null);

  let goalLabel: Label | null = null;
  while (heap.size > 0) {
    const lab = heap.pop()!;
    if (!lab.alive) continue; // retired by a dominating label after being queued
    if (lab.node === goal) {
      goalLabel = lab; // first popped goal label is the global minimum weight
      break;
    }
    for (const e of neighbors(lab.node)) {
      if (e.mode !== "walk" && !allowed.has(e.mode)) continue;
      if (e.kind === "walk" && e.walkMin > MAX_SINGLE_WALK_MIN) continue;
      const nextWalk = lab.walk + (e.walkMin || 0);
      if (e.walkMin > 0 && nextWalk > MAX_TOTAL_WALK_MIN) continue; // hard cap
      addLabel(e.to, lab.weight + edgeWeight(e, profile), nextWalk, lab, e);
    }
  }

  if (!goalLabel) return null;

  // reconstruct
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
