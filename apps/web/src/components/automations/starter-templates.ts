import {
  DEFAULT_AUTOMATION_SETTINGS,
  NODE_CATALOG,
  type AutomationDefinition,
  type AutomationNode,
  type NodeConfigMap,
  type NodeType,
} from '@crm/shared';
import { Bell, CalendarX, FilePlus, MessageSquareReply, Send, Smile, type LucideIcon } from 'lucide-react';

/** Starting points offered by "New automation". */
export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  definition: AutomationDefinition;
}

function node<T extends NodeType>(key: string, type: T, config: Partial<NodeConfigMap[T]> = {}): AutomationNode {
  return { key, type, config: { ...NODE_CATALOG[type].defaultConfig(), ...config } } as AutomationNode;
}

function chain(...nodes: AutomationNode[]) {
  return { nodes, edges: nodes.slice(1).map((n, i) => ({ source: nodes[i].key, target: n.key })) };
}

const settings = (patch: Partial<AutomationDefinition['settings']> = {}) => ({ ...DEFAULT_AUTOMATION_SETTINGS, ...patch });

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'blank',
    name: 'Start from scratch',
    description: 'An empty automation: choose the trigger and add steps.',
    icon: FilePlus,
    definition: { triggers: [], graph: { nodes: [], edges: [] }, settings: settings() },
  },
  {
    id: 'welcome',
    name: 'Welcome new conversations',
    description: 'Greets contacts who write to you for the first time.',
    icon: Smile,
    definition: {
      triggers: [{ key: 'conversation.opened', filters: { any: [{ all: [{ field: 'trigger.opened_by', operator: 'equals', value: 'contact' }] }] } }],
      graph: chain(
        node('welcome', 'send_message', {
          text: "Hi {{contact.first_name|there}}, thanks for writing to {{organization.name}}! We'll get back to you shortly.",
        }),
      ),
      settings: settings(),
    },
  },
  {
    id: 'keyword',
    name: 'Reply to a keyword',
    description: 'Answers right away when a message mentions prices.',
    icon: MessageSquareReply,
    definition: {
      triggers: [{ key: 'message.received', filters: { any: [{ all: [{ field: 'trigger.content', operator: 'matches_keywords', value: ['price', 'prices', 'cost', 'how much'] }] }] } }],
      graph: chain(node('reply', 'send_message', { channel_strategy: 'same_channel', text: 'Here are our prices: …' })),
      settings: settings({ allow_parallel_runs: true }),
    },
  },
  {
    id: 'weekly_sms',
    name: 'Weekly SMS to a group',
    description: 'Every Monday at 9:00, an SMS to the contacts with a tag.',
    icon: Send,
    definition: {
      triggers: [{ key: 'schedule', schedule: { frequency: 'weekly', time: '09:00', days_of_week: [1] } }],
      graph: chain(
        node('sms', 'send_sms', {
          recipients: { mode: 'filter', filter: { any: [{ all: [{ field: 'contact.tags', operator: 'has_tag', value: 'vip' }] }] } },
          text: 'Hi {{contact.first_name|there}}, this week at {{organization.name}}: …',
        }),
      ),
      settings: settings(),
    },
  },
  {
    id: 'no_show',
    name: 'Follow up a no-show',
    description: 'An hour after a missed appointment, offers to book again.',
    icon: CalendarX,
    definition: {
      triggers: [{ key: 'appointment.no_show' }],
      graph: chain(
        node('wait', 'wait', { mode: 'duration', duration: { amount: 1, unit: 'hours' } }),
        node('message', 'send_message', { text: 'Hi {{contact.first_name|there}}, we missed you today. Would you like to book another time?' }),
      ),
      settings: settings({ exit_on: [{ trigger: 'appointment.created' }] }),
    },
  },
  {
    id: 'notify_lead',
    name: 'Tell the team about new leads',
    description: 'An alert in the app when a new contact arrives from a channel.',
    icon: Bell,
    definition: {
      triggers: [{ key: 'contact.created', filters: { any: [{ all: [{ field: 'trigger.source', operator: 'equals', value: 'channel' }] }] } }],
      graph: chain(node('notify', 'notify_team', { title: 'New lead: {{contact.full_name|a new contact}}', in_app: true })),
      settings: settings({ respect_opt_out: false }),
    },
  },
];
