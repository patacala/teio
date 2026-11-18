'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AlertTriangle, Maximize2, Plus, Settings2, ZoomIn, ZoomOut, Zap } from 'lucide-react';
import { NODE_CATALOG, type AutomationGraph, type AutomationTrigger } from '@crm/shared';
import { cn } from '@/lib/utils';
import { NODE_ICONS, nodeLabel, summarizeNode, summarizeTrigger } from '../automation-ui';
import type { InsertPoint } from './graph-ops';
import { NODE_H, NODE_W, TRIGGER_H, TRIGGER_W, layoutTree } from './layout';

export type Selection = { kind: 'trigger' } | { kind: 'settings' } | { kind: 'node'; key: string } | null;

interface Props {
  graph: AutomationGraph;
  triggers: AutomationTrigger[];
  selection: Selection;
  onSelect(selection: Selection): void;
  onAdd(point: InsertPoint): void;
  /** Validation messages per step key ('trigger' for the triggers). */
  issues: Map<string, string[]>;
  readOnly?: boolean;
}

const PAD = 48;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;

/**
 * The automation drawn as a tree: the trigger on top, each step below its
 * parent, branches side by side, and a "+" on every path to add a step there.
 */
export function AutomationCanvas({ graph, triggers, selection, onSelect, onAdd, issues, readOnly }: Props) {
  const layout = useMemo(() => layoutTree(graph), [graph]);
  const viewport = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: PAD });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const fit = useCallback(() => {
    const el = viewport.current;
    const width = el?.clientWidth || 960;
    const height = el?.clientHeight || 640;
    const z = Math.max(MIN_ZOOM, Math.min(1, (width - PAD * 2) / layout.width, (height - PAD * 2) / layout.height));
    setZoom(z);
    setPan({ x: (width - layout.width * z) / 2, y: PAD });
  }, [layout.width, layout.height]);

  // Fit when the canvas first renders; later edits keep the user's view.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    fit();
  }, [fit]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setPan({ x: drag.current.panX + e.clientX - drag.current.x, y: drag.current.panY + e.clientY - drag.current.y });
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const zoomBy = (factor: number) => setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)));

  const triggerIssues = issues.get('trigger') ?? [];

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface-raised/40" data-testid="automation-canvas">
      <div
        ref={viewport}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) zoomBy(e.deltaY > 0 ? 0.9 : 1.1);
          else setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, width: layout.width, height: layout.height }}
        >
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={layout.width} height={layout.height} aria-hidden>
            {layout.edges.map((edge) => {
              const midY = edge.from.y + (edge.to.y - edge.from.y) / 2;
              const d = `M ${edge.from.x} ${edge.from.y} V ${midY} H ${edge.to.x} V ${edge.target ? edge.to.y : midY + 24}`;
              return (
                <g key={edge.id}>
                  <path d={d} fill="none" className={cn('stroke-[1.5]', edge.handle === 'failed' ? 'stroke-danger/50' : 'stroke-strong')} strokeDasharray={edge.target ? undefined : '4 4'} />
                  {edge.label && (
                    <text x={edge.to.x} y={midY - 6} textAnchor="middle" className="fill-secondary text-[11px] font-medium">
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Trigger */}
          <button
            type="button"
            onClick={() => onSelect({ kind: 'trigger' })}
            className={cn(
              'absolute flex items-center gap-3 rounded-xl border bg-surface px-3 text-left shadow-sm transition-colors',
              selection?.kind === 'trigger' ? 'border-accent ring-2 ring-accent/20' : 'border-subtle hover:border-strong',
            )}
            style={{ left: layout.trigger.x, top: layout.trigger.y, width: TRIGGER_W, height: TRIGGER_H }}
            aria-label="Trigger"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-olive-dark text-accent">
              <Zap className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted">When</span>
              <span className="block truncate text-xs font-medium text-primary">
                {triggers.length ? triggers.map(summarizeTrigger).join(' · or ') : 'Choose what starts it'}
              </span>
            </span>
            {triggerIssues.length > 0 && <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-label={`${triggerIssues.length} problem(s)`} />}
          </button>

          {/* Steps */}
          {layout.nodes.map(({ key, node, x, y }) => {
            const Icon = NODE_ICONS[node.type];
            const nodeIssues = issues.get(key) ?? [];
            const selected = selection?.kind === 'node' && selection.key === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect({ kind: 'node', key })}
                className={cn(
                  'absolute flex items-center gap-3 rounded-xl border bg-surface px-3 text-left shadow-sm transition-colors',
                  selected ? 'border-accent ring-2 ring-accent/20' : nodeIssues.length ? 'border-warning/60' : 'border-subtle hover:border-strong',
                )}
                style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
                aria-label={`${nodeLabel(node)}: ${summarizeNode(node)}`}
                data-node-key={key}
              >
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', node.type === 'condition' || node.type.startsWith('wait') ? 'bg-surface-raised text-secondary' : 'bg-olive-dark text-accent')}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-primary">{nodeLabel(node)}</span>
                  <span className="block truncate text-[11px] text-secondary">{summarizeNode(node)}</span>
                  {node.label && <span className="block truncate text-[10px] text-muted">{NODE_CATALOG[node.type].label}</span>}
                </span>
                {nodeIssues.length > 0 && <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-label={`${nodeIssues.length} problem(s)`} />}
              </button>
            );
          })}

          {/* "+" on every path */}
          {!readOnly &&
            layout.addPoints.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onAdd({ source: p.source, handle: p.handle })}
                className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-strong bg-surface text-secondary shadow-sm transition-colors hover:border-accent hover:bg-olive-dark hover:text-accent"
                style={{ left: p.x, top: p.y }}
                aria-label={p.between ? 'Insert a step here' : 'Add a step here'}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            ))}
        </div>
      </div>

      <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-lg border border-subtle bg-surface p-1 shadow-sm">
        <button type="button" onClick={() => zoomBy(1.15)} className="rounded p-1.5 text-secondary hover:bg-surface-hover" aria-label="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.15)} className="rounded p-1.5 text-secondary hover:bg-surface-hover" aria-label="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={fit} className="rounded p-1.5 text-secondary hover:bg-surface-hover" aria-label="Fit to view">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <span className="px-1 text-[10px] tabular-nums text-muted">{Math.round(zoom * 100)}%</span>
      </div>

      <button
        type="button"
        onClick={() => onSelect({ kind: 'settings' })}
        className={cn(
          'absolute right-3 top-3 flex items-center gap-1.5 rounded-lg border bg-surface px-2.5 py-1.5 text-xs font-medium shadow-sm',
          selection?.kind === 'settings' ? 'border-accent text-accent' : 'border-subtle text-secondary hover:text-primary',
        )}
      >
        <Settings2 className="h-3.5 w-3.5" /> Settings
      </button>
    </div>
  );
}
