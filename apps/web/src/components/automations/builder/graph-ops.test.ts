import { describe, expect, it } from 'vitest';
import type { AutomationGraph, AutomationNode } from '@crm/shared';
import { canInsertAt, createNode, insertNode, removalSize, removeNode, rootKey } from './graph-ops';
import { layoutTree, NODE_H, GAP_Y } from './layout';

const node = (key: string, type: AutomationNode['type']): AutomationNode => ({ key, type, config: {} as never });
const empty: AutomationGraph = { nodes: [], edges: [] };

function shape(graph: AutomationGraph) {
  return graph.edges.map((e) => `${e.source}-${e.sourceHandle ?? 'next'}->${e.target}`).sort();
}

describe('graph operations', () => {
  it('adds the first step under the trigger, then steps below it', () => {
    let g = insertNode(empty, { source: null, handle: 'next' }, node('a', 'send_sms'));
    g = insertNode(g, { source: 'a', handle: 'next' }, node('b', 'wait'));
    expect(rootKey(g)).toBe('a');
    expect(shape(g)).toEqual(['a-next->b']);
  });

  it('inserting between two steps moves the lower one under the new step', () => {
    let g = insertNode(empty, { source: null, handle: 'next' }, node('a', 'send_sms'));
    g = insertNode(g, { source: 'a', handle: 'next' }, node('b', 'wait'));
    g = insertNode(g, { source: 'a', handle: 'next' }, node('c', 'condition'));
    expect(shape(g)).toEqual(['a-next->c', 'c-yes->b']);
    g = insertNode(g, { source: null, handle: 'next' }, node('d', 'add_tag'));
    expect(rootKey(g)).toBe('d');
    expect(shape(g)).toEqual(['a-next->c', 'c-yes->b', 'd-next->a']);
  });

  it('only allows "End" where nothing follows', () => {
    const g = insertNode(insertNode(empty, { source: null, handle: 'next' }, node('a', 'send_sms')), { source: 'a', handle: 'next' }, node('b', 'wait'));
    expect(canInsertAt(g, { source: 'a', handle: 'next' }, 'end')).toBe(false);
    expect(canInsertAt(g, { source: 'b', handle: 'next' }, 'end')).toBe(true);
    expect(() => insertNode(g, { source: 'a', handle: 'next' }, node('e', 'end'))).toThrow();
  });

  it('removing a step lifts its path; removing a branching step takes its branches', () => {
    let g = insertNode(empty, { source: null, handle: 'next' }, node('a', 'send_sms'));
    g = insertNode(g, { source: 'a', handle: 'next' }, node('c', 'condition'));
    g = insertNode(g, { source: 'c', handle: 'yes' }, node('y', 'send_sms'));
    g = insertNode(g, { source: 'c', handle: 'no' }, node('n', 'send_sms'));
    g = insertNode(g, { source: 'y', handle: 'next' }, node('y2', 'wait'));

    expect(removalSize(g, 'y')).toBe(1);
    expect(shape(removeNode(g, 'y'))).toEqual(['a-next->c', 'c-no->n', 'c-yes->y2']);
    expect(removalSize(g, 'c')).toBe(4);
    const withoutBranch = removeNode(g, 'c');
    expect(withoutBranch.nodes.map((n) => n.key)).toEqual(['a']);
    expect(withoutBranch.edges).toEqual([]);
    expect(shape(removeNode(g, 'a'))).toEqual(['c-no->n', 'c-yes->y', 'y-next->y2']);
  });

  it('gives new steps unique keys and default settings', () => {
    const g = insertNode(empty, { source: null, handle: 'next' }, createNode(empty, 'send_sms'));
    const second = createNode(g, 'send_sms');
    expect(second.key).toBe('send_sms_2');
    expect(second.config).toMatchObject({ recipients: { mode: 'run_contact' }, text: '' });
  });
});

describe('tree layout', () => {
  it('centres steps over their branches and offers a "+" on every open path', () => {
    let g = insertNode(empty, { source: null, handle: 'next' }, node('c', 'condition'));
    g = insertNode(g, { source: 'c', handle: 'yes' }, node('y', 'send_sms'));
    const layout = layoutTree(g);
    const c = layout.nodes.find((n) => n.key === 'c')!;
    const y = layout.nodes.find((n) => n.key === 'y')!;
    expect(y.y).toBe(c.y + NODE_H + GAP_Y);
    expect(y.x).toBeLessThan(c.x); // the "yes" column is on the left
    expect(layout.addPoints.map((p) => `${p.source}:${p.handle}:${p.between}`).sort()).toEqual([
      'c:no:false',
      'c:yes:true',
      'null:next:true',
      'y:next:false',
    ]);
    expect(layout.edges.find((e) => e.id === 'c:no')?.label).toBe('No');
  });

  it('lays out an empty automation as the trigger with one "+"', () => {
    const layout = layoutTree(empty);
    expect(layout.nodes).toEqual([]);
    expect(layout.addPoints).toEqual([expect.objectContaining({ source: null, between: false })]);
  });
});
