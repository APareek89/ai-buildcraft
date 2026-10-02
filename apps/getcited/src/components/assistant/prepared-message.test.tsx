import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolCallCard } from './tool-call-card';
import savedMessages from '../../../tests/fixtures/prepared-tool-message.json';
import olderMessages from '../../../tests/fixtures/prepared-tool-message-before.json';

// Render the real cards, including approval/download controls. Only the account
// transport is replaced: rendering a saved message must never call a provider.
const transport = vi.hoisted(() => ({ action: vi.fn(), download: vi.fn() }));
vi.mock('@/components/account/account-provider', () => ({ useRequests: () => transport }));
vi.mock('@/app/(app)/tracker/actions', () => ({ approvePlanAction: vi.fn() }));

type SavedPart = Parameters<typeof ToolCallCard>[0]['part'];
type SavedMessages = typeof savedMessages | typeof olderMessages;
function cards(messages: SavedMessages) {
  return messages.flatMap(message => message.parts)
    .filter(part => part.type.startsWith('tool-')) as SavedPart[];
}
function render(messages: SavedMessages) {
  return renderToStaticMarkup(<>{cards(messages).map((part, index) => <ToolCallCard key={index} part={part} prepared />)}</>);
}
beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Saved-message render attempted a network request'); }));
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe('the entire persisted prepared message', () => {
  it('renders both real tool cards, nested plan preview and explicit actions from the saved factory fixture', () => {
    expect(cards(savedMessages).map(part => part.type)).toEqual(['tool-run_benchmark', 'tool-build_plan']);
    const html = render(savedMessages);
    for (const text of ['Share of voice', 'GEO Action Plan', 'Top tactics', 'First weeks', 'Approve → add to Tracker', 'Word', 'PDF', 'Excel', 'illustrative results']) expect(html).toContain(text);
    expect(html).toContain('$400 of $400'); expect(html).toContain('69 of 400h');
    expect(html).not.toContain('NaN'); expect(html).not.toContain('Unavailable');
    expect(html).not.toContain('totals unavailable'); expect(html).not.toContain('no complete');
    expect(transport.action).not.toHaveBeenCalled(); expect(transport.download).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not crash or invent numeric summaries when reopening the exact older incomplete message shape', () => {
    const oldPlan = cards(olderMessages).find(part => part.type === 'tool-build_plan')!.output as Record<string, unknown>;
    expect(oldPlan.spent_usd).toBeUndefined(); expect(oldPlan.spent_hours).toBeUndefined(); expect(oldPlan.person_hours).toBeUndefined();
    const html = render(olderMessages);
    expect(html).toContain('Allocation totals unavailable in this saved card');
    expect(html).toContain('GEO Action Plan'); expect(html).toContain('Approve → add to Tracker');
    expect(html).not.toContain('NaN'); expect(fetch).not.toHaveBeenCalled();
  });
});
