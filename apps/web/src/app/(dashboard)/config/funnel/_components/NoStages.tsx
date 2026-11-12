import { Layers, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function NoStages({ onConfigure }: { onConfigure: () => void }) {
  return (
    <Card className="flex flex-col items-center justify-center py-16 text-center">
      <div className="icon-tile mb-3 flex h-12 w-12 items-center justify-center rounded-2xl">
        <Layers className="h-5 w-5 text-accent" />
      </div>
      <p className="text-sm font-medium text-primary">This funnel has no stages yet</p>
      <p className="text-xs text-muted mt-1">Add stages to start moving contacts through it.</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onConfigure}>
        <Settings2 className="h-3.5 w-3.5" /> Configure stages
      </Button>
    </Card>
  );
}
