const { findQuoteMatches, normalize, similarityRatio } = require('../src/utils/quoteMatcher');

describe('Quote Matching Algorithm (findQuoteMatches)', () => {
  const samplePageTextItems = [
    { str: 'MASTER SERVICES AGREEMENT' },
    { str: 'Section 4. Term and Termination' },
    { str: 'This Agreement shall commence on the Effective Date and continue for one (1)' },
    { str: 'year. Thereafter, this Agreement shall automatically renew for successive' },
    { str: 'one-year terms unless either party provides written notice of non-renewal' },
    { str: 'at least ninety (90) days prior to the expiration of the current term.' },
    { str: 'Section 5. Limitation of Liability' },
    { str: 'Neither party shall be liable for indirect, incidental, or consequential damages.' },
    { str: 'Notwithstanding anything to the contrary, Vendor liability shall be unlimited' },
    { str: 'for breaches of confidentiality or gross negligence.' },
  ];

  test('normalizes text consistently', () => {
    expect(normalize('  Hello   World \n \t “quotes” ')).toBe('hello world "quotes"');
    expect(normalize('Long—dash and –en-dash')).toBe('long-dash and -en-dash');
  });

  test('calculates similarity ratio correctly', () => {
    expect(similarityRatio('identical string', 'identical string')).toBe(1.0);
    expect(similarityRatio('almost identical', 'almost identica1')).toBeGreaterThan(0.9);
    expect(similarityRatio('completely different', 'something else')).toBeLessThan(0.4);
  });

  test('matches verbatim single-item quote', () => {
    const quote = 'Neither party shall be liable for indirect, incidental, or consequential damages.';
    const result = findQuoteMatches(samplePageTextItems, quote);

    expect(result.matched).toBe(true);
    expect(result.similarity).toBeGreaterThanOrEqual(0.95);
    expect(result.itemIndices).toContain(7);
  });

  test('matches multi-item spanning quote across line wraps', () => {
    const quote = 'Agreement shall automatically renew for successive one-year terms unless either party provides written notice';
    const result = findQuoteMatches(samplePageTextItems, quote);

    expect(result.matched).toBe(true);
    expect(result.similarity).toBeGreaterThanOrEqual(0.85);
    expect(result.itemIndices).toContain(3);
    expect(result.itemIndices).toContain(4);
  });

  test('matches quote with minor whitespace/case variance', () => {
    const quote = 'VENDOR LIABILITY SHALL BE UNLIMITED FOR BREACHES OF CONFIDENTIALITY';
    const result = findQuoteMatches(samplePageTextItems, quote);

    expect(result.matched).toBe(true);
    expect(result.similarity).toBeGreaterThanOrEqual(0.85);
    expect(result.itemIndices).toContain(8);
    expect(result.itemIndices).toContain(9);
  });

  test('returns matched: false for text not present on the page', () => {
    const hallucinatedQuote = 'The vendor warrants that all source code will be placed into third party escrow within 10 days.';
    const result = findQuoteMatches(samplePageTextItems, hallucinatedQuote);

    expect(result.matched).toBe(false);
    expect(result.similarity).toBeLessThan(0.85);
    expect(result.itemIndices).toEqual([]);
  });

  test('handles plain string array input as well as objects', () => {
    const stringItems = samplePageTextItems.map((item) => item.str);
    const quote = 'Section 4. Term and Termination';
    const result = findQuoteMatches(stringItems, quote);

    expect(result.matched).toBe(true);
    expect(result.itemIndices).toContain(1);
  });
});
