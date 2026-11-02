'use client';

import { useState } from 'react';
import { useAgentConfig, useProvisionAgent } from '@/hooks/useAIAgents';
import { AGENT_TYPES, type AgentType } from '@/services/ai-agents.service';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot } from 'lucide-react';
import { toast } from '@/hooks/useToast';
import { MessageRoutingSection } from './_components/MessageRoutingSection';
import { BriefTab } from './_components/BriefTab';
import { IdentityTab } from './_components/IdentityTab';
import { QualificationTab } from './_components/QualificationTab';
import { PersonalityTab } from './_components/PersonalityTab';
import { RulesTab } from './_components/RulesTab';
import { StrategiesTab } from './_components/StrategiesTab';
import { KnowledgeTab } from './_components/KnowledgeTab';

/** Single agent per org (see crm-integration-2026-09 memory) — this screen
 * used to be a list+create UI over a disconnected local table; it's now a
 * direct editor for the one real agent, proxied to ProSales' Management API.
 */
export default function ConfigAgentsPage() {
  const { data: config, isLoading, error } = useAgentConfig();
  const provision = useProvisionAgent();
  // Rules & Strategies are the internals a non-technical user can't configure
  // (strategy_type/cooldown/tactics). The Brief tab generates them; these stay
  // hidden behind an "expert mode" toggle for fine manual edits.
  const [expertMode, setExpertMode] = useState(false);
  const [agentType, setAgentType] = useState<AgentType>('sales');

  const handleProvision = async () => {
    try {
      await provision.mutateAsync(agentType);
      toast({ title: 'Agent created', variant: 'default' });
    } catch {
      toast({ title: 'Failed to create agent', variant: 'error' });
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Your agent</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Identity, personality, rules, strategies, and knowledge for the conversational agent.
        </p>
      </div>

      <MessageRoutingSection />

      <div className="rounded-xl border border-border bg-panel p-5">
        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center text-center py-12">
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-3">
              <Bot className="h-6 w-6 text-red-400" />
            </div>
            <h3 className="font-medium text-gray-900 text-sm">You don't have an agent yet</h3>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mb-4">
              {(error as Error).message ||
                "Create your organization's conversational agent — it configures itself."}
            </p>
            <label className="text-xs font-medium text-gray-600 mb-1">Agent type</label>
            <select
              value={agentType}
              onChange={(e) => setAgentType(e.target.value as AgentType)}
              className="rounded-md border border-border bg-white px-3 py-1.5 text-sm text-gray-800 mb-4"
            >
              {AGENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <Button
              onClick={handleProvision}
              disabled={provision.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {provision.isPending ? 'Creating…' : 'Create agent'}
            </Button>
          </div>
        )}

        {config && (
          <Tabs defaultValue="brief">
            <div className="flex items-center justify-between mb-5 gap-3">
              <TabsList>
                <TabsTrigger value="brief">Brief</TabsTrigger>
                <TabsTrigger value="identity">Identity</TabsTrigger>
                <TabsTrigger value="personality">Personality</TabsTrigger>
                <TabsTrigger value="qualification">Qualification</TabsTrigger>
                {expertMode && <TabsTrigger value="rules">Rules</TabsTrigger>}
                {expertMode && <TabsTrigger value="strategies">Strategies</TabsTrigger>}
                <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
              </TabsList>
              <button
                type="button"
                onClick={() => setExpertMode((v) => !v)}
                className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                {expertMode ? 'Hide expert settings' : 'Expert mode'}
              </button>
            </div>

            <TabsContent value="brief">
              <BriefTab />
            </TabsContent>
            <TabsContent value="identity">
              <IdentityTab identity={config.identity} />
            </TabsContent>
            <TabsContent value="personality">
              <PersonalityTab personality={config.personality} />
            </TabsContent>
            <TabsContent value="qualification">
              <QualificationTab fields={config.qualification ?? []} expertMode={expertMode} />
            </TabsContent>
            <TabsContent value="rules">
              <RulesTab rules={config.rules} />
            </TabsContent>
            <TabsContent value="strategies">
              <StrategiesTab strategies={config.strategies} />
            </TabsContent>
            <TabsContent value="knowledge">
              <KnowledgeTab />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
