import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BenchmarkResult, type BenchmarkOutput } from './benchmark-result';

const result: BenchmarkOutput = {
  brand: 'Linear', panel: ['prepared'], answer_count: 4, cost_usd: 0,
  share_of_voice: [{ brand: 'Linear', mentions: 3, sov: 0.75 }],
  your_citation_share: 0.5, total_citations: 4, citation_gap_count: 1,
  sentiment: { score: 0.4, distribution: { positive: 2, neutral: 1, negative: 0 } },
  report_id: 'prepared-report',
};
afterEach(() => vi.unstubAllGlobals());
describe('persisted benchmark cards', () => {
  it('renders the calculated summary from the normal tool DTO', () => {
    vi.stubGlobal('React', React);
    const html = renderToStaticMarkup(<BenchmarkResult data={result} />);
    expect(html).toContain('75%'); expect(html).toContain('50%');
    expect(html).toContain('positive'); expect(html).toContain('4 recorded domains/citations');
    expect(html).not.toContain('no complete');
  });
  it('keeps recorded SoV visible for an older saved subset without inventing missing metrics', () => {
    vi.stubGlobal('React', React);
    const older = { ...result } as Partial<BenchmarkOutput>;
    delete older.sentiment; delete older.your_citation_share;
    delete older.total_citations; delete older.citation_gap_count;
    const html = renderToStaticMarkup(<BenchmarkResult data={older as BenchmarkOutput} />);
    expect(html).toContain('75%'); expect(html).toContain('Unavailable');
    expect(html).toContain('no complete domain and sentiment summary');
    expect(html).not.toContain('NaN'); expect(html).not.toContain('0 recorded domains/citations');
  });
});
