import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CONTACT_FIELDS, type ConditionGroup } from '@crm/shared';
import { describe, expect, it, vi } from 'vitest';
import type { AutomationOrgCatalog } from '@/services/automations.service';
import { ConditionBuilder } from './ConditionBuilder';

const catalog: AutomationOrgCatalog = {
  channels: [],
  stages: [{ id: 'st-1', name: 'Qualified', stage_type: 'open', funnel_id: 'f-1', funnel_name: 'Sales' }],
  tags: ['vip'],
  custom_fields: [],
  users: [],
  calendars: [],
  services: [],
  ai_connections: [],
};

/** The builder is controlled; this keeps its value like a form would. */
function Harness({ initial, onChange }: { initial?: ConditionGroup; onChange(v: ConditionGroup): void }) {
  const [value, setValue] = useState<ConditionGroup | undefined>(initial);
  return (
    <ConditionBuilder
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
      fields={CONTACT_FIELDS}
      catalog={catalog}
      emptyLabel="Every contact"
    />
  );
}

async function pick(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement, option: string) {
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('ConditionBuilder', () => {
  it('builds "tag is vip AND lead score at least 50"', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const user = userEvent.setup();

    expect(screen.getByText('Every contact')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add condition' }));

    await pick(user, screen.getByRole('combobox', { name: 'Field' }), 'Tags');
    expect(screen.getByRole('combobox', { name: 'Comparison' })).toHaveTextContent('has tag');
    // Tags suggest the organization's tags (an input with a list is a combobox).
    await user.type(screen.getByRole('combobox', { name: 'Value' }), 'vip');

    await user.click(screen.getByRole('button', { name: '+ And' }));
    const fields = screen.getAllByRole('combobox', { name: 'Field' });
    await pick(user, fields[1], 'Lead score');
    await pick(user, screen.getAllByRole('combobox', { name: 'Comparison' })[1], 'is at least');
    await user.type(screen.getByRole('spinbutton', { name: 'Value' }), '50');

    expect(onChange).toHaveBeenLastCalledWith({
      any: [
        {
          all: [
            { field: 'contact.tags', operator: 'has_tag', value: 'vip' },
            { field: 'contact.lead_score', operator: 'gte', value: 50 },
          ],
        },
      ],
    });
  });

  it('offers the funnel stages of the organization and adds OR groups', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initial={{ any: [{ all: [{ field: 'contact.stage', operator: 'equals', value: '' }] }] }} />);
    const user = userEvent.setup();

    await pick(user, screen.getByRole('combobox', { name: 'Value' }), 'Sales · Qualified');
    await user.click(screen.getByRole('button', { name: 'Or another group' }));

    expect(screen.getByText('or')).toBeInTheDocument();
    expect(onChange.mock.lastCall?.[0].any).toHaveLength(2);
    expect(onChange.mock.lastCall?.[0].any[0]).toEqual({ all: [{ field: 'contact.stage', operator: 'equals', value: 'st-1' }] });
  });

  it('splits "any of" values by comma, hides the value for "is empty", and removes rules', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initial={{ any: [{ all: [{ field: 'contact.first_name', operator: 'in', value: [] }] }] }} />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('textbox', { name: 'Value' }), 'Ana, Luis');
    expect(onChange).toHaveBeenLastCalledWith({ any: [{ all: [{ field: 'contact.first_name', operator: 'in', value: ['Ana', 'Luis'] }] }] });

    await pick(user, screen.getByRole('combobox', { name: 'Comparison' }), 'is empty');
    expect(screen.queryByRole('textbox', { name: 'Value' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove condition' }));
    expect(onChange).toHaveBeenLastCalledWith({ any: [] });
    expect(screen.getByText('Every contact')).toBeInTheDocument();
  });
});
