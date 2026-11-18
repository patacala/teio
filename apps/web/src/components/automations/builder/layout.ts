import type { AutomationGraph, AutomationNode, NodeHandle } from '@crm/shared';
import { childOf, rootKey, visibleHandles } from './graph-ops';

/** Canvas geometry (px). */
export const NODE_W = 260;
export const NODE_H = 72;
export const TRIGGER_W = 300;
export const TRIGGER_H = 72;
export const GAP_X = 48;
export const GAP_Y = 72;

export interface PlacedNode {
  key: string;
  node: AutomationNode;
  x: number;
  y: number;
}

export interface PlacedEdge {
  id: string;
  source: string | null;
  handle: NodeHandle;
  target: string | null;
  /** Path from the parent's bottom to the child's top (or to an open "+" slot). */
  from: { x: number; y: number };
  to: { x: number; y: number };
  label: string | null;
}

/** A "+" button: add a step on this path. */
export interface AddPoint {
  id: string;
  source: string | null;
  handle: NodeHandle;
  x: number;
  y: number;
  /** A step already follows (inserting moves it below the new one). */
  between: boolean;
}

export interface TreeLayout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  addPoints: AddPoint[];
  trigger: { x: number; y: number };
  width: number;
  height: number;
}

export const HANDLE_LABELS: Record<NodeHandle, string | null> = {
  next: null,
  yes: 'Yes',
  no: 'No',
  matched: 'It happened',
  timeout: 'Timed out',
  failed: 'If it fails',
};

/**
 * Lays a tree out top-down: every step is centred over its branches, and
 * each branch gets a column as wide as what hangs from it.
 */
export function layoutTree(graph: AutomationGraph): TreeLayout {
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]));
  const widths = new Map<string, number>();

  const handlesOf = (key: string): NodeHandle[] => {
    const node = byKey.get(key);
    return node ? visibleHandles(graph, node) : [];
  };
  const columnWidth = (key: string | null): number => (key ? subtreeWidth(key) : NODE_W);
  function subtreeWidth(key: string): number {
    const cached = widths.get(key);
    if (cached !== undefined) return cached;
    const handles = handlesOf(key);
    const columns = handles.map((h) => columnWidth(childOf(graph, key, h)));
    const total = columns.length > 1 ? columns.reduce((a, b) => a + b, 0) + GAP_X * (columns.length - 1) : (columns[0] ?? NODE_W);
    const width = Math.max(NODE_W, total);
    widths.set(key, width);
    return width;
  }

  const nodes: PlacedNode[] = [];
  const edges: PlacedEdge[] = [];
  const addPoints: AddPoint[] = [];
  let maxY = 0;

  const root = rootKey(graph);
  const totalWidth = Math.max(TRIGGER_W, root ? subtreeWidth(root) : NODE_W);
  const triggerX = totalWidth / 2 - TRIGGER_W / 2;
  const firstY = TRIGGER_H + GAP_Y;

  // Trigger → first step (or an empty slot)
  const triggerBottom = { x: totalWidth / 2, y: TRIGGER_H };
  edges.push({ id: 'trigger', source: null, handle: 'next', target: root, from: triggerBottom, to: { x: totalWidth / 2, y: firstY }, label: null });
  addPoints.push({ id: 'add:trigger', source: null, handle: 'next', x: totalWidth / 2, y: TRIGGER_H + GAP_Y / 2, between: !!root });

  function place(key: string, left: number, y: number): void {
    const width = subtreeWidth(key);
    const node = byKey.get(key)!;
    const x = left + width / 2 - NODE_W / 2;
    nodes.push({ key, node, x, y });
    maxY = Math.max(maxY, y + NODE_H);

    const handles = handlesOf(key);
    const columns = handles.map((h) => ({ handle: h, child: childOf(graph, key, h) }));
    const widthsOfColumns = columns.map((c) => columnWidth(c.child));
    const used = widthsOfColumns.reduce((a, b) => a + b, 0) + GAP_X * Math.max(0, columns.length - 1);
    let cursor = left + (width - used) / 2;
    const childY = y + NODE_H + GAP_Y;
    const from = { x: x + NODE_W / 2, y: y + NODE_H };

    columns.forEach((col, i) => {
      const colWidth = widthsOfColumns[i];
      const centre = cursor + colWidth / 2;
      const label = columns.length > 1 || col.handle !== 'next' ? HANDLE_LABELS[col.handle] : null;
      edges.push({ id: `${key}:${col.handle}`, source: key, handle: col.handle, target: col.child, from, to: { x: centre, y: childY }, label });
      addPoints.push({
        id: `add:${key}:${col.handle}`,
        source: key,
        handle: col.handle,
        x: centre,
        y: col.child ? childY - GAP_Y / 2 + (label ? 10 : 0) : childY - GAP_Y / 2 + (label ? 10 : 0),
        between: !!col.child,
      });
      if (col.child) place(col.child, cursor, childY);
      else maxY = Math.max(maxY, childY - GAP_Y / 2 + 16);
      cursor += colWidth + GAP_X;
    });
  }

  if (root) place(root, 0, firstY);
  else maxY = Math.max(maxY, firstY);

  return { nodes, edges, addPoints, trigger: { x: triggerX, y: 0 }, width: totalWidth, height: maxY + 24 };
}
