import type { NodeConfigMap, NodeHandle, NodeType } from './graph';

export type NodeCategory = 'messaging' | 'ai' | 'team' | 'contact' | 'logic';

export interface NodeCatalogEntry<T extends NodeType = NodeType> {
  type: T;
  label: string;
  description: string;
  category: NodeCategory;
  /** The ways out of the step. `failed` is optional on actions: unconnected = the run fails. */
  handles: NodeHandle[];
  /** Needs the contact the run is about: not available in scheduled (organization) runs. */
  needsContact: boolean;
  /** Needs a conversation (e.g. turning the AI on/off). */
  needsConversation: boolean;
  /** Sends something to customers or the team (counted and deduplicated per recipient). */
  delivers: boolean;
  defaultConfig: () => NodeConfigMap[T];
}

type Catalog = { [T in NodeType]: NodeCatalogEntry<T> };

const RUN_CONTACT = { mode: 'run_contact' as const };

export const NODE_CATALOG: Catalog = {
  send_message: {
    type: 'send_message',
    label: 'Send message',
    description: 'Send a chat message (WhatsApp, Instagram, Messenger, SMS…), on the channel the strategy picks.',
    category: 'messaging',
    handles: ['next', 'failed'],
    needsContact: false,
    needsConversation: false,
    delivers: true,
    defaultConfig: () => ({ recipients: RUN_CONTACT, channel_strategy: 'auto', text: '' }),
  },
  send_email: {
    type: 'send_email',
    label: 'Send email',
    description: 'Send an email built from a subject, paragraphs, an optional button and links.',
    category: 'messaging',
    handles: ['next', 'failed'],
    needsContact: false,
    needsConversation: false,
    delivers: true,
    defaultConfig: () => ({
      recipients: RUN_CONTACT,
      email: { subject: '', heading: '{{organization.name}}', paragraphs: [''], footer: '{{organization.name}}' },
      calendar_invite: 'none',
    }),
  },
  send_sms: {
    type: 'send_sms',
    label: 'Send SMS',
    description: 'Send a text message to a phone number.',
    category: 'messaging',
    handles: ['next', 'failed'],
    needsContact: false,
    needsConversation: false,
    delivers: true,
    defaultConfig: () => ({ recipients: RUN_CONTACT, text: '' }),
  },
  send_to_ai: {
    type: 'send_to_ai',
    label: 'Send to AI agent',
    description: 'Hand the event to the AI agent so it answers the contact.',
    category: 'ai',
    handles: ['next', 'failed'],
    needsContact: true,
    needsConversation: false,
    delivers: true,
    defaultConfig: () => ({ agent_id: null }),
  },
  set_ai: {
    type: 'set_ai',
    label: 'Turn AI on/off',
    description: 'Let the AI answer this conversation, or stop it so the team takes over.',
    category: 'ai',
    handles: ['next'],
    needsContact: true,
    needsConversation: true,
    delivers: false,
    defaultConfig: () => ({ active: false }),
  },
  notify_team: {
    type: 'notify_team',
    label: 'Notify team',
    description: 'Show an alert in the app and/or email team members.',
    category: 'team',
    handles: ['next', 'failed'],
    needsContact: false,
    needsConversation: false,
    delivers: true,
    defaultConfig: () => ({ title: '', in_app: true }),
  },
  create_task: {
    type: 'create_task',
    label: 'Create task',
    description: 'Add a task to the follow-up agenda for the team.',
    category: 'team',
    handles: ['next'],
    needsContact: true,
    needsConversation: false,
    delivers: false,
    defaultConfig: () => ({ title: '', wait_until_done: false }),
  },
  call: {
    type: 'call',
    label: 'Call contact',
    description: 'Start an AI phone call to the contact.',
    category: 'team',
    handles: ['next', 'failed'],
    needsContact: true,
    needsConversation: false,
    delivers: true,
    defaultConfig: () => ({}),
  },
  add_tag: {
    type: 'add_tag',
    label: 'Add tag',
    description: 'Add a tag to the contact.',
    category: 'contact',
    handles: ['next'],
    needsContact: true,
    needsConversation: false,
    delivers: false,
    defaultConfig: () => ({ tag: '' }),
  },
  remove_tag: {
    type: 'remove_tag',
    label: 'Remove tag',
    description: 'Remove a tag from the contact.',
    category: 'contact',
    handles: ['next'],
    needsContact: true,
    needsConversation: false,
    delivers: false,
    defaultConfig: () => ({ tag: '' }),
  },
  update_contact: {
    type: 'update_contact',
    label: 'Update contact',
    description: 'Set contact fields or captured data.',
    category: 'contact',
    handles: ['next'],
    needsContact: true,
    needsConversation: false,
    delivers: false,
    defaultConfig: () => ({ fields: [{ field: '', value: '' }] }),
  },
  move_stage: {
    type: 'move_stage',
    label: 'Move funnel stage',
    description: 'Move the contact to a funnel stage.',
    category: 'contact',
    handles: ['next'],
    needsContact: true,
    needsConversation: false,
    delivers: false,
    defaultConfig: () => ({ stage_id: '' }),
  },
  wait: {
    type: 'wait',
    label: 'Wait',
    description: 'Wait some time, or until a time of day.',
    category: 'logic',
    handles: ['next'],
    needsContact: false,
    needsConversation: false,
    delivers: false,
    defaultConfig: () => ({ mode: 'duration', duration: { amount: 1, unit: 'days' }, business_hours: false }),
  },
  wait_for_event: {
    type: 'wait_for_event',
    label: 'Wait for event',
    description: 'Wait until something happens (e.g. the contact replies), or give up after a while.',
    category: 'logic',
    handles: ['matched', 'timeout'],
    needsContact: true,
    needsConversation: false,
    delivers: false,
    defaultConfig: () => ({ events: ['message.received'], timeout: { amount: 1, unit: 'days' } }),
  },
  condition: {
    type: 'condition',
    label: 'If / else',
    description: 'Take one path or the other depending on conditions.',
    category: 'logic',
    handles: ['yes', 'no'],
    needsContact: false,
    needsConversation: false,
    delivers: false,
    defaultConfig: () => ({ condition: { any: [{ all: [] }] } }),
  },
  end: {
    type: 'end',
    label: 'End',
    description: 'Finish the automation here.',
    category: 'logic',
    handles: [],
    needsContact: false,
    needsConversation: false,
    delivers: false,
    defaultConfig: () => ({}),
  },
};

export const NODE_TYPES = Object.keys(NODE_CATALOG) as NodeType[];

export function isNodeType(value: string): value is NodeType {
  return Object.prototype.hasOwnProperty.call(NODE_CATALOG, value);
}

/** Handles a branch must connect (actions' `failed` is optional). */
export function requiredHandles(type: NodeType): NodeHandle[] {
  return NODE_CATALOG[type].handles.filter((h) => h !== 'failed' && h !== 'next');
}
