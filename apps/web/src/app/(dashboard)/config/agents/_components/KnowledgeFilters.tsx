import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const KNOWLEDGE_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'faq', label: 'FAQ' },
  { value: 'product', label: 'Product' },
  { value: 'policies', label: 'Policies' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'support', label: 'Support' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'technical', label: 'Technical' },
];

const ALL = '__all__';

export interface KnowledgeFiltersState {
  search: string;
  category: string;
  status: string;
}

interface KnowledgeFiltersProps {
  filters: KnowledgeFiltersState;
  onChange: (filters: KnowledgeFiltersState) => void;
}

export function KnowledgeFilters({ filters, onChange }: KnowledgeFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <Input
        placeholder="Search entries…"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="sm:w-64"
      />

      <Select
        value={filters.category || ALL}
        onValueChange={(v) => onChange({ ...filters, category: v === ALL ? '' : v })}
      >
        <SelectTrigger className="sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All categories</SelectItem>
          {KNOWLEDGE_CATEGORIES.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.status || ALL}
        onValueChange={(v) => onChange({ ...filters, status: v === ALL ? '' : v })}
      >
        <SelectTrigger className="sm:w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
