export interface AutomationAgent {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  trigger_event: string;
  workflow_endpoint: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AgentTool {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  endpoint?: string;
  method: string;
  config_schema: Record<string, unknown>;
  created_at: Date;
}

export interface ToolExecution {
  id: string;
  organization_id: string;
  agent_id: string;
  tool_id?: string;
  conversation_id?: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
  status: 'pending' | 'success' | 'failed';
  created_at: Date;
}

export interface AgentLog {
  id: string;
  organization_id: string;
  agent_id: string;
  conversation_id?: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: Date;
}

export interface AgentTriggerJobData {
  event_type: string;
  organization_id: string;
  conversation_id?: string;
  contact_id?: string;
  payload: Record<string, unknown>;
}

export interface AgentToolExecutedEvent {
  organization_id: string;
  agent_id: string;
  tool_name: string;
  execution_id: string;
}
