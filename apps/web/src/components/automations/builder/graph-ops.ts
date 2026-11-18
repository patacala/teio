import {
  NODE_CATALOG,
  type AutomationEdge,
  type AutomationGraph,
  type AutomationNode,
  type NodeHandle,
  type NodeType,
} from '@crm/shared';

/**
 * Pure operations on an automation's steps. Graphs are trees: every step has
 * one parent (the trigger for the first step), so inserting and removing only
 * ever re-links one path.
 */

/** Where a new step goes: under the trigger (source null) or on a step's path. */
export interface InsertPoint {
  source: string | null;
  handle: NodeHandle;
}

export function handleOf(edge: AutomationEdge): NodeHandle {
  return edge.sourceHandle ?? 'next';
}

export function rootKey(graph: AutomationGraph): string | null {
  const targets = new Set(graph.edges.map((e) => e.target));
  return graph.nodes.find((n) => !targets.has(n.key))?.key ?? null;
}

export function childOf(graph: AutomationGraph, source: string, handle: NodeHandle): string | null {
  return graph.edges.find((e) => e.source === source && handleOf(e) === handle)?.target ?? null;
}

export function parentOf(graph: AutomationGraph, key: string): InsertPoint | null {
  const edge = graph.edges.find((e) => e.target === key);
  return edge ? { source: edge.source, handle: handleOf(edge) } : null;
}

/** The path a step continues on by default (where the steps below it re-attach). */
export function primaryHandle(type: NodeType): NodeHandle | null {
  return NODE_CATALOG[type].handles.find((h) => h !== 'failed') ?? null;
}

/** The paths drawn for a step: its branches, plus "failed" only once connected. */
export function visibleHandles(graph: AutomationGraph, node: AutomationNode): NodeHandle[] {
  return NODE_CATALOG[node.type].handles.filter((h) => h !== 'failed' || childOf(graph, node.key, 'failed') !== null);
}

export function newNodeKey(graph: AutomationGraph, type: NodeType): string {
  const used = new Set(graph.nodes.map((n) => n.key));
  for (let i = 1; ; i++) {
    const key = `${type}_${i}`;
    if (!used.has(key)) return key;
  }
}

export function createNode<T extends NodeType>(graph: AutomationGraph, type: T): AutomationNode<T> {
  return { key: newNodeKey(graph, type), type, config: NODE_CATALOG[type].defaultConfig() };
}

/** What sits below an insertion point (the step that will move under the new one). */
function targetAt(graph: AutomationGraph, at: InsertPoint): string | null {
  return at.source === null ? rootKey(graph) : childOf(graph, at.source, at.handle);
}

/** "End" has no way out: it can only be added where nothing follows. */
export function canInsertAt(graph: AutomationGraph, at: InsertPoint, type: NodeType): boolean {
  return primaryHandle(type) !== null || targetAt(graph, at) === null;
}

export function insertNode(graph: AutomationGraph, at: InsertPoint, node: AutomationNode): AutomationGraph {
  const below = targetAt(graph, at);
  const primary = primaryHandle(node.type);
  if (below && !primary) throw new Error('An "End" step can only be added at the end of a path');

  const edges = graph.edges.filter((e) => !(at.source !== null && e.source === at.source && handleOf(e) === at.handle));
  if (at.source !== null) edges.push(at.handle === 'next' ? { source: at.source, target: node.key } : { source: at.source, target: node.key, sourceHandle: at.handle });
  if (below && primary) edges.push(primary === 'next' ? { source: node.key, target: below } : { source: node.key, target: below, sourceHandle: primary });
  return { nodes: [...graph.nodes, node], edges };
}

export function descendants(graph: AutomationGraph, key: string): Set<string> {
  const found = new Set<string>();
  const stack = graph.edges.filter((e) => e.source === key).map((e) => e.target);
  while (stack.length) {
    const k = stack.pop()!;
    if (found.has(k)) continue;
    found.add(k);
    graph.edges.filter((e) => e.source === k).forEach((e) => stack.push(e.target));
  }
  return found;
}

/** How many steps removing `key` takes with it (its branches, when it has several). */
export function removalSize(graph: AutomationGraph, key: string): number {
  const connected = graph.edges.filter((e) => e.source === key);
  return connected.length > 1 ? 1 + descendants(graph, key).size : 1;
}

/**
 * Removes a step. With one path below it, that path moves up to its place;
 * with several branches, the branches are removed too.
 */
export function removeNode(graph: AutomationGraph, key: string): AutomationGraph {
  const parent = parentOf(graph, key);
  const out = graph.edges.filter((e) => e.source === key);
  const removed = new Set([key, ...(out.length > 1 ? descendants(graph, key) : [])]);
  const edges = graph.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target));
  if (out.length === 1 && parent) {
    const child = out[0].target;
    edges.push(parent.handle === 'next' ? { source: parent.source!, target: child } : { source: parent.source!, target: child, sourceHandle: parent.handle });
  }
  return { nodes: graph.nodes.filter((n) => !removed.has(n.key)), edges };
}

export function updateNode(graph: AutomationGraph, key: string, patch: Partial<Pick<AutomationNode, 'config' | 'label'>>): AutomationGraph {
  return { ...graph, nodes: graph.nodes.map((n) => (n.key === key ? ({ ...n, ...patch } as AutomationNode) : n)) };
}

/** Connects the "failed" path of a step to a new step (or removes it). */
export function hasFailedPath(graph: AutomationGraph, key: string): boolean {
  return childOf(graph, key, 'failed') !== null;
}
