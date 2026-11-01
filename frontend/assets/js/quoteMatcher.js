/**
 * Quote Matcher - Pure function for finding verbatim or near-verbatim quote matches
 * in PDF text items. Standard ES Module.
 */

export function normalize(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function similarityRatio(s1, s2) {
  if (!s1 || !s2) return 0.0;
  if (s1 === s2) return 1.0;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;

  // Use Levenshtein distance for strings <= 500 chars, else bigram Dice
  if (longer.length <= 500) {
    const costs = [];
    for (let i = 0; i <= shorter.length; i++) {
      costs[i] = i;
    }
    for (let i = 1; i <= longer.length; i++) {
      let nw = i - 1;
      costs[0] = i;
      for (let j = 1; j <= shorter.length; j++) {
        const cj = Math.min(
          1 + Math.min(costs[j], costs[j - 1]),
          longer[i - 1] === shorter[j - 1] ? nw : nw + 1
        );
        nw = costs[j];
        costs[j] = cj;
      }
    }
    return (longer.length - costs[shorter.length]) / longer.length;
  }

  // Bigram Dice for longer strings
  const getBigrams = (str) => {
    const s = new Set();
    for (let i = 0; i < str.length - 1; i++) {
      s.add(str.slice(i, i + 2));
    }
    return s;
  };
  const b1 = getBigrams(s1);
  const b2 = getBigrams(s2);
  let intersection = 0;
  for (const bg of b1) {
    if (b2.has(bg)) intersection++;
  }
  return (2.0 * intersection) / (b1.size + b2.size || 1);
}

/**
 * Finds matching text items that correspond to quoteText.
 * @param {Array<string|object>} textItems - Array of strings or objects { str, textContent }
 * @param {string} quoteText - The quote to match
 * @param {object} options - { threshold: 0.85, maxWindowSlack: 15 }
 * @returns {object} { matched: boolean, startIndex, endIndex, itemIndices: number[], similarity: number, matchedText: string }
 */
export function findQuoteMatches(textItems, quoteText, options = {}) {
  const threshold = options.threshold !== undefined ? options.threshold : 0.85;
  if (!textItems || textItems.length === 0 || !quoteText || !quoteText.trim()) {
    return { matched: false, startIndex: -1, endIndex: -1, itemIndices: [], similarity: 0.0, matchedText: '' };
  }

  const normQuote = normalize(quoteText);
  if (!normQuote) {
    return { matched: false, startIndex: -1, endIndex: -1, itemIndices: [], similarity: 0.0, matchedText: '' };
  }

  // Extract raw strings and keep track of char offsets per item
  const rawItems = [];
  const itemCharOffsets = []; // { itemIndex, startChar, endChar }
  let combinedText = '';

  for (let i = 0; i < textItems.length; i++) {
    const item = textItems[i];
    let str = '';
    if (typeof item === 'string') {
      str = item;
    } else if (item && typeof item.str === 'string') {
      str = item.str;
    } else if (item && typeof item.textContent === 'string') {
      str = item.textContent;
    } else if (item && item.text) {
      str = item.text;
    }

    const start = combinedText.length;
    combinedText += str + ' ';
    const end = combinedText.length;

    rawItems.push(str);
    itemCharOffsets.push({ itemIndex: i, start, end, str });
  }

  const normCombined = normalize(combinedText);

  // 1. Exact normalized match in combined text
  const exactPos = normCombined.indexOf(normQuote);
  if (exactPos !== -1) {
    const quoteWords = normQuote.split(' ');
    const firstWord = quoteWords[0];
    const lastWord = quoteWords[quoteWords.length - 1];

    let firstItem = -1;
    let lastItem = -1;

    for (let i = 0; i < itemCharOffsets.length; i++) {
      const itemNorm = normalize(itemCharOffsets[i].str);
      if (firstItem === -1 && itemNorm.includes(firstWord)) {
        firstItem = i;
      }
      if (firstItem !== -1 && itemNorm.includes(lastWord)) {
        lastItem = i;
      }
    }

    if (firstItem !== -1 && lastItem !== -1 && lastItem >= firstItem) {
      const indices = [];
      for (let idx = firstItem; idx <= lastItem; idx++) indices.push(idx);
      return {
        matched: true,
        startIndex: firstItem,
        endIndex: lastItem,
        itemIndices: indices,
        similarity: 1.0,
        matchedText: rawItems.slice(firstItem, lastItem + 1).join(' ').trim(),
      };
    }
  }

  // 2. Sliding window over item spans
  const quoteLen = normQuote.length;
  let bestMatch = {
    matched: false,
    startIndex: -1,
    endIndex: -1,
    itemIndices: [],
    similarity: 0.0,
    matchedText: '',
  };

  for (let i = 0; i < rawItems.length; i++) {
    let candidate = '';
    const currentIndices = [];

    for (let j = i; j < Math.min(rawItems.length, i + 30); j++) {
      candidate = candidate ? candidate + ' ' + rawItems[j] : rawItems[j];
      currentIndices.push(j);

      const normCand = normalize(candidate);
      if (normCand.length > quoteLen * 1.6 + 50) break;

      const sim = similarityRatio(normCand, normQuote);
      if (sim > bestMatch.similarity) {
        bestMatch = {
          matched: sim >= threshold,
          startIndex: i,
          endIndex: j,
          itemIndices: [...currentIndices],
          similarity: sim,
          matchedText: candidate.trim(),
        };
        if (sim >= 0.98) return bestMatch;
      }
    }
  }

  if (bestMatch.similarity < threshold) {
    return {
      matched: false,
      startIndex: -1,
      endIndex: -1,
      itemIndices: [],
      similarity: bestMatch.similarity,
      matchedText: '',
    };
  }

  return bestMatch;
}

export default {
  normalize,
  similarityRatio,
  findQuoteMatches,
};
