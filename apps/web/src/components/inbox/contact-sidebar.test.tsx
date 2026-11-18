import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '@/test/msw/api';
import { ContactSidebar } from './contact-sidebar';
import type { Contact } from '@/services/contacts.service';
import type { Payment } from '@/services/payments.service';

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const state = vi.hoisted(() => ({
  contact: undefined as Contact | undefined,
  payments: undefined as Payment[] | undefined,
  paymentsLoading: false,
}));

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
const createConversation = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
}));
vi.mock('@/hooks/useContacts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useContacts')>()),
  useContact: () => ({ data: state.contact, isLoading: false }),
}));
vi.mock('@/hooks/useConversations', () => ({
  useConversation: () => ({ data: undefined }),
  useCreateConversation: () => createConversation,
  useHandoff: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/usePayments', () => ({
  usePayments: () => ({ data: state.payments, isLoading: state.paymentsLoading }),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useToast', () => ({ toast }));

const optOutMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/contacts.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/contacts.service')>()),
  contactsService: {
    ...(await importOriginal<typeof import('@/services/contacts.service')>()).contactsService,
    optOut: optOutMock,
  },
}));

beforeEach(() => {
  mockApi('get', '/automations', { data: [] });
  mockApi('get', '/automations/contact/contact-1/runs', { data: [] });
});

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'contact-1',
    first_name: 'Ada',
    last_name: 'Lovelace',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay-1',
    organization_id: 'org-1',
    service_id: 'svc-1',
    service: { id: 'svc-1', name: 'Consultation', amount: 5000, is_active: true } as never,
    contact_id: 'contact-1',
    conversation_id: null,
    amount: 5000,
    currency: 'usd',
    status: 'paid',
    checkout_url: null,
    paid_at: '2026-01-02T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('ContactSidebar — Payments section', () => {
  it('shows nothing when the lead has no payments', () => {
    state.contact = contact();
    state.payments = [];
    renderWithQueryClient(<ContactSidebar contactId="contact-1" conversationId={null} />);
    expect(screen.queryByText('Payments')).not.toBeInTheDocument();
  });

  it('lists the lead’s payments with amount and status', () => {
    state.contact = contact();
    state.payments = [payment()];
    renderWithQueryClient(<ContactSidebar contactId="contact-1" conversationId={null} />);
    expect(screen.getByText('Payments')).toBeInTheDocument();
    expect(screen.getByText('Consultation')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.getByText('paid')).toBeInTheDocument();
  });
});

describe('ContactSidebar — Start Conversation', () => {
  it('offers no channel when the lead has no identifier on file', () => {
    state.contact = contact({ phone: undefined, channel_ids: undefined });
    state.payments = [];
    renderWithQueryClient(<ContactSidebar contactId="contact-1" conversationId={null} />);
    expect(screen.getByText('No reachable channel on file for this lead.')).toBeInTheDocument();
  });

  it('lets the agent start a conversation on a channel the lead is reachable on', () => {
    state.contact = contact({ phone: '+15551234567' });
    state.payments = [];
    renderWithQueryClient(<ContactSidebar contactId="contact-1" conversationId={null} />);
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('hides Start Conversation once a conversation is already selected', () => {
    state.contact = contact({ phone: '+15551234567' });
    state.payments = [];
    renderWithQueryClient(<ContactSidebar contactId="contact-1" conversationId="conv-1" />);
    expect(screen.queryByText('Start Conversation')).not.toBeInTheDocument();
  });
});

describe('ContactSidebar — channel opt-out', () => {
  it('offers to opt out when the lead has not already', () => {
    state.contact = contact({ tags: [] });
    state.payments = [];
    renderWithQueryClient(<ContactSidebar contactId="contact-1" conversationId={null} />);
    expect(screen.getByRole('button', { name: 'Opt out of automated messages' })).toBeInTheDocument();
  });

  it('shows the opted-out badge once the lead already has the tag', () => {
    state.contact = contact({ tags: ['opt-out'] });
    state.payments = [];
    renderWithQueryClient(<ContactSidebar contactId="contact-1" conversationId={null} />);
    expect(screen.getByText('Opted out of automated messages')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Opt out of automated messages' })).not.toBeInTheDocument();
  });

  it('calls the opt-out endpoint when the agent clicks the button', async () => {
    state.contact = contact({ tags: [] });
    state.payments = [];
    optOutMock.mockResolvedValue({ contact: { ...state.contact, tags: ['opt-out'] }, automations_stopped: 1 });
    renderWithQueryClient(<ContactSidebar contactId="contact-1" conversationId={null} />);

    await userEvent.click(screen.getByRole('button', { name: 'Opt out of automated messages' }));

    await waitFor(() => expect(optOutMock).toHaveBeenCalledWith('contact-1'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'Opted out. Stopped 1 automation(s) for this contact.' }));
  });
});

describe('ContactSidebar — Automations', () => {
  it('shows the automations section for the lead', async () => {
    state.contact = contact();
    state.payments = [];
    renderWithQueryClient(<ContactSidebar contactId="contact-1" conversationId={null} />);
    expect(screen.getByText('Automations')).toBeInTheDocument();
    expect(await screen.findByText('Not in any automation right now.')).toBeInTheDocument();
  });
});
