import {
  DEFAULT_AUTOMATION_SETTINGS,
  NODE_CATALOG,
  type AutomationDefinition,
  type AutomationEdge,
  type AutomationNode,
  type AutomationTrigger,
  type NodeConfigMap,
  type NodeHandle,
  type NodeType,
} from '@crm/shared';

/** A step with the catalog's default configuration, overridden by `config`. */
export function step<T extends NodeType>(key: string, type: T, config: Partial<NodeConfigMap[T]> = {}): AutomationNode<T> {
  return { key, type, config: { ...NODE_CATALOG[type].defaultConfig(), ...config } as NodeConfigMap[T] };
}

export function edge(source: string, target: string, sourceHandle?: NodeHandle): AutomationEdge {
  return sourceHandle ? { source, target, sourceHandle } : { source, target };
}

/** Steps connected one after the other through `next`. */
export function chain(...nodes: AutomationNode[]): { nodes: AutomationNode[]; edges: AutomationEdge[] } {
  return { nodes, edges: nodes.slice(1).map((n, i) => edge(nodes[i].key, n.key)) };
}

export function definition(
  triggers: AutomationTrigger[],
  graph: { nodes: AutomationNode[]; edges: AutomationEdge[] },
  settings: Partial<AutomationDefinition['settings']> = {},
): AutomationDefinition {
  return { triggers, graph, settings: { ...DEFAULT_AUTOMATION_SETTINGS, ...settings } };
}
