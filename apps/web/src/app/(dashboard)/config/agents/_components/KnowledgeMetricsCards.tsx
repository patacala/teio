import { BookOpen, CheckCircle, XCircle, Tag } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { KnowledgeMetrics } from '@/services/knowledge.service';

interface KnowledgeMetricsCardsProps {
  metrics: KnowledgeMetrics | undefined;
  loading: boolean;
}

const cards = [
  { label: 'Total', key: 'total' as keyof KnowledgeMetrics, icon: BookOpen, color: 'text-blue-600 bg-blue-50' },
  { label: 'Active', key: 'active' as keyof KnowledgeMetrics, icon: CheckCircle, color: 'text-blue-600 bg-blue-50' },
  { label: 'Inactive', key: 'inactive' as keyof KnowledgeMetrics, icon: XCircle, color: 'text-gray-500 bg-gray-100' },
  { label: 'Categories', key: 'categories_count' as keyof KnowledgeMetrics, icon: Tag, color: 'text-blue-600 bg-blue-50' },
];

export function KnowledgeMetricsCards({ metrics, loading }: KnowledgeMetricsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(({ label, key, icon: Icon, color }) => (
        <div key={key} className="min-w-0 bg-panel border border-border rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">{label}</span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-7 w-12" />
          ) : (
            <p className="text-xl font-bold text-gray-900">{metrics?.[key] ?? 0}</p>
          )}
        </div>
      ))}
    </div>
  );
}
