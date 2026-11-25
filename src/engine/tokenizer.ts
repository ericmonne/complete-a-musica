import { CompoundSubItem, LineToken, ParsedLyrics, WordSegment } from '../types/game';
import { normalizeApostrophes, normalizeWord } from './normalize';

const LEADING_SLANG_APO_REGEX =
  /^'(?:cause|cuz|cos|til|till|bout|em|round|neath|tis|twas|n')(?=$|[^\p{L}\p{N}])/iu;
const STANDALONE_N_REGEX = /^'n'$/i;
const TRAILING_IN_REGEX = /^([\p{L}]{2,}in)'$/iu;
const TRAILING_PLURAL_S_REGEX = /^([\p{L}]{2,}s)'$/iu;
const ALPHA_NUM_CHAR_REGEX = /[\p{L}\p{N}]/u;

const STRICT_S_CONTRACTION_BASES = new Set([
  'he',
  'she',
  'it',
  'that',
  'this',
  'there',
  'here',
  'what',
  'who',
  'where',
  'when',
  'why',
  'how',
]);

const INDEFINITE_PRONOUN_BASES = new Set([
  'everything',
  'nothing',
  'something',
  'someone',
  'somebody',
  'everyone',
  'everybody',
  'nobody',
  'anyone',
  'anybody',
  'one',
]);

const CONTRACTION_NEXT_WORDS = new Set([
  'a',
  'an',
  'the',
  'not',
  'never',
  'been',
  'got',
  'gonna',
  'going',
  'so',
  'too',
  'still',
  'just',
  'here',
  'there',
  'in',
  'on',
  'up',
  'out',
  'all',
]);

const REGULAR_NT_REGEX =
  /^(do|does|did|is|are|was|were|have|has|had|would|could|should|must|might|need|dare)(n)'(t)$/i;

const SUFFIX_CONTRACTIONS: Record<string, string[]> = {
  m: ['am'],
  re: ['are'],
  ve: ['have'],
  ll: ['will', 'shall'],
  d: ['would', 'had', 'did'],
};

function stripOuterPunctuation(chunk: string): {
  leadingPunct: string;
  core: string;
  trailingPunct: string;
} {
  let core = chunk;
  let leadingPunct = '';
  let trailingPunct = '';

  // Extract leading punctuation while preserving meaningful leading apostrophes ('cause, 'em, 'n', etc.)
  while (core.length > 0 && !ALPHA_NUM_CHAR_REGEX.test(core[0])) {
    if (
      core[0] === "'" &&
      (LEADING_SLANG_APO_REGEX.test(core) || STANDALONE_N_REGEX.test(core))
    ) {
      break;
    }
    leadingPunct += core[0];
    core = core.slice(1);
  }

  // Extract trailing punctuation while preserving meaningful trailing apostrophes (walkin', boys', 'n')
  while (core.length > 0 && !ALPHA_NUM_CHAR_REGEX.test(core[core.length - 1])) {
    if (
      core[core.length - 1] === "'" &&
      (TRAILING_IN_REGEX.test(core) ||
        TRAILING_PLURAL_S_REGEX.test(core) ||
        STANDALONE_N_REGEX.test(core))
    ) {
      break;
    }
    trailingPunct = core[core.length - 1] + trailingPunct;
    core = core.slice(0, -1);
  }

  return { leadingPunct, core, trailingPunct };
}

class TokenizerBuilder {
  segments: WordSegment[] = [];
  keyToSegmentIds: Record<string, number[]> = {};

  private addSegment(acceptedKeys: string[]): number {
    const uniqueKeys = Array.from(new Set(acceptedKeys.filter((k) => k.length > 0)));
    const id = this.segments.length;
    this.segments.push({ id, acceptedKeys: uniqueKeys });

    for (const key of uniqueKeys) {
      if (!this.keyToSegmentIds[key]) {
        this.keyToSegmentIds[key] = [];
      }
      this.keyToSegmentIds[key].push(id);
    }

    return id;
  }

  private emitSingleWord(word: string, keys?: string[]): CompoundSubItem[] {
    const resolvedKeys = keys ?? [normalizeWord(word)];
    if (resolvedKeys.every((k) => k.length === 0)) {
      return [{ type: 'punct', text: word }];
    }
    const segmentId = this.addSegment(resolvedKeys);
    return [{ type: 'part', segmentId, text: word }];
  }

  tokenizeSubWord(word: string, nextWordNorm: string | null): CompoundSubItem[] {
    if (!word) {
      return [];
    }

    if (!word.includes("'")) {
      return this.emitSingleWord(word);
    }

    // 'tis / 'twas
    const tisMatch = word.match(/^'(t)(is|was)$/i);
    if (tisMatch) {
      const fullNorm = normalizeWord(word);
      const tId = this.addSegment(['it', fullNorm]);
      const verbId = this.addSegment([tisMatch[2].toLowerCase(), fullNorm]);
      return [
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: tId, text: tisMatch[1] },
        { type: 'part', segmentId: verbId, text: tisMatch[2] },
      ];
    }

    // 'n'
    if (STANDALONE_N_REGEX.test(word)) {
      const nChar = word.slice(1, 2);
      const segId = this.addSegment(['and', 'n']);
      return [
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: segId, text: nChar },
        { type: 'punct', text: "'" },
      ];
    }

    // Leading-apostrophe slang: 'cause, 'cuz, 'cos, 'til, 'till, 'bout, 'em, 'round, 'neath
    const causeMatch = word.match(/^'(cause|cuz|cos)$/i);
    if (causeMatch) {
      const segId = this.addSegment(['because', 'cause', 'cuz', 'cos']);
      return [
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: segId, text: causeMatch[1] },
      ];
    }

    const tilMatch = word.match(/^'(til|till)$/i);
    if (tilMatch) {
      const segId = this.addSegment(['until', 'til', 'till']);
      return [
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: segId, text: tilMatch[1] },
      ];
    }

    const boutMatch = word.match(/^'(bout)$/i);
    if (boutMatch) {
      const segId = this.addSegment(['about', 'bout']);
      return [
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: segId, text: boutMatch[1] },
      ];
    }

    const emMatch = word.match(/^'(em)$/i);
    if (emMatch) {
      const segId = this.addSegment(['them', 'em']);
      return [
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: segId, text: emMatch[1] },
      ];
    }

    const roundMatch = word.match(/^'(round)$/i);
    if (roundMatch) {
      const segId = this.addSegment(['around', 'round']);
      return [
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: segId, text: roundMatch[1] },
      ];
    }

    const neathMatch = word.match(/^'(neath)$/i);
    if (neathMatch) {
      const segId = this.addSegment(['beneath', 'neath']);
      return [
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: segId, text: neathMatch[1] },
      ];
    }

    // Trailing in' (walkin', lovin', nothin')
    const inMatch = word.match(/^([\p{L}]{2,})in'$/iu);
    if (inMatch) {
      const stem = word.slice(0, -1); // e.g. "walkin"
      const ingForm = stem + 'g'; // e.g. "walking"
      const segId = this.addSegment([normalizeWord(stem), normalizeWord(ingForm)]);
      return [
        { type: 'part', segmentId: segId, text: stem },
        { type: 'punct', text: "'" },
      ];
    }

    // Trailing plural possessive s' (boys', lovers')
    const pluralSMatch = word.match(TRAILING_PLURAL_S_REGEX);
    if (pluralSMatch) {
      const stem = pluralSMatch[1];
      const segId = this.addSegment([normalizeWord(stem)]);
      return [
        { type: 'part', segmentId: segId, text: stem },
        { type: 'punct', text: "'" },
      ];
    }

    // Irregular contractions
    const wontMatch = word.match(/^(wo)(n)'(t)$/i);
    if (wontMatch) {
      const firstId = this.addSegment(['will', 'wont']);
      const secondId = this.addSegment(['not', 'wont']);
      return [
        { type: 'part', segmentId: firstId, text: wontMatch[1] },
        { type: 'part', segmentId: secondId, text: wontMatch[2] },
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: secondId, text: wontMatch[3] },
      ];
    }

    const cantMatch = word.match(/^(can)'(t)$/i);
    if (cantMatch) {
      const firstId = this.addSegment(['can', 'cannot', 'cant']);
      const secondId = this.addSegment(['not', 'cannot', 'cant']);
      return [
        { type: 'part', segmentId: firstId, text: cantMatch[1] },
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: secondId, text: cantMatch[2] },
      ];
    }

    const shantMatch = word.match(/^(sha)(n)'(t)$/i);
    if (shantMatch) {
      const firstId = this.addSegment(['shall', 'shant']);
      const secondId = this.addSegment(['not', 'shant']);
      return [
        { type: 'part', segmentId: firstId, text: shantMatch[1] },
        { type: 'part', segmentId: secondId, text: shantMatch[2] },
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: secondId, text: shantMatch[3] },
      ];
    }

    const aintMatch = word.match(/^(ai)(n)'(t)$/i);
    if (aintMatch) {
      const firstId = this.addSegment(['aint', 'am', 'is', 'are', 'have', 'has']);
      const secondId = this.addSegment(['not', 'aint']);
      return [
        { type: 'part', segmentId: firstId, text: aintMatch[1] },
        { type: 'part', segmentId: secondId, text: aintMatch[2] },
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: secondId, text: aintMatch[3] },
      ];
    }

    const letsMatch = word.match(/^(let)'(s)$/i);
    if (letsMatch) {
      const firstId = this.addSegment(['let']);
      const secondId = this.addSegment(['us']);
      return [
        { type: 'part', segmentId: firstId, text: letsMatch[1] },
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: secondId, text: letsMatch[2] },
      ];
    }

    const yallMatch = word.match(/^(y)'(all)$/i);
    if (yallMatch) {
      const firstId = this.addSegment(['you', 'yall']);
      const secondId = this.addSegment(['all', 'yall']);
      return [
        { type: 'part', segmentId: firstId, text: yallMatch[1] },
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: secondId, text: yallMatch[2] },
      ];
    }

    const cmonMatch = word.match(/^(c)'(mon)$/i);
    if (cmonMatch) {
      const firstId = this.addSegment(['come', 'cmon']);
      const secondId = this.addSegment(['on', 'cmon']);
      return [
        { type: 'part', segmentId: firstId, text: cmonMatch[1] },
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: secondId, text: cmonMatch[2] },
      ];
    }

    const oclockMatch = word.match(/^(o)'(clock)$/i);
    if (oclockMatch) {
      const firstId = this.addSegment(['of', 'o', 'oclock']);
      const secondId = this.addSegment(['clock', 'oclock']);
      return [
        { type: 'part', segmentId: firstId, text: oclockMatch[1] },
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: secondId, text: oclockMatch[2] },
      ];
    }

    const maamMatch = word.match(/^(ma)'(am)$/i);
    if (maamMatch) {
      const segId = this.addSegment(['maam', 'madam']);
      return [
        { type: 'part', segmentId: segId, text: maamMatch[1] },
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: segId, text: maamMatch[2] },
      ];
    }

    // rock'n'roll or X'n'Y
    const nCompoundMatch = word.match(/^([\p{L}]+)'(n)'([\p{L}]+)$/iu);
    if (nCompoundMatch) {
      const leftId = this.addSegment([normalizeWord(nCompoundMatch[1])]);
      const midId = this.addSegment(['and', 'n']);
      const rightId = this.addSegment([normalizeWord(nCompoundMatch[3])]);
      return [
        { type: 'part', segmentId: leftId, text: nCompoundMatch[1] },
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: midId, text: nCompoundMatch[2] },
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: rightId, text: nCompoundMatch[3] },
      ];
    }

    // Regular n't contractions (don't, isn't, wouldn't, etc.)
    const ntMatch = word.match(REGULAR_NT_REGEX);
    if (ntMatch) {
      const base = ntMatch[1];
      const baseNorm = normalizeWord(base);
      const firstId = this.addSegment([baseNorm]);
      const secondId = this.addSegment(['not', `${baseNorm}nt`]);
      return [
        { type: 'part', segmentId: firstId, text: base },
        { type: 'part', segmentId: secondId, text: ntMatch[2] },
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: secondId, text: ntMatch[3] },
      ];
    }

    // Standard suffix contractions ('m, 're, 've, 'll, 'd)
    const suffixMatch = word.match(/^([a-zA-Z]+)'(m|re|ve|ll|d)$/i);
    if (suffixMatch) {
      const base = suffixMatch[1];
      const suffix = suffixMatch[2];
      const suffixKeys = SUFFIX_CONTRACTIONS[suffix.toLowerCase()];
      const firstId = this.addSegment([normalizeWord(base)]);
      const secondId = this.addSegment(suffixKeys);
      return [
        { type: 'part', segmentId: firstId, text: base },
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: secondId, text: suffix },
      ];
    }

    // Portuguese d' contractions (d'água, d'ouro) and English d'you
    const dMatch = word.match(/^(d)'([\p{L}]{2,})$/iu);
    if (dMatch) {
      const secondNorm = normalizeWord(dMatch[2]);
      const firstKeys = secondNorm === 'you' ? ['do'] : ['de', 'da', 'do'];
      const firstId = this.addSegment(firstKeys);
      const secondId = this.addSegment([secondNorm]);
      return [
        { type: 'part', segmentId: firstId, text: dMatch[1] },
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: secondId, text: dMatch[2] },
      ];
    }

    // 's contractions vs possessives
    const sMatch = word.match(/^([\p{L}]+)'(s)$/iu);
    if (sMatch) {
      const base = sMatch[1];
      const baseNorm = normalizeWord(base);
      if (STRICT_S_CONTRACTION_BASES.has(baseNorm)) {
        const firstId = this.addSegment([baseNorm]);
        const secondId = this.addSegment(['is', 'has']);
        return [
          { type: 'part', segmentId: firstId, text: base },
          { type: 'punct', text: "'" },
          { type: 'part', segmentId: secondId, text: sMatch[2] },
        ];
      }

      const isContractionContext =
        INDEFINITE_PRONOUN_BASES.has(baseNorm) ||
        (nextWordNorm !== null &&
          (CONTRACTION_NEXT_WORDS.has(nextWordNorm) || nextWordNorm.endsWith('ing')));

      if (isContractionContext) {
        const firstId = this.addSegment([baseNorm]);
        const secondId = this.addSegment(['is', 'has', `${baseNorm}s`]);
        return [
          { type: 'part', segmentId: firstId, text: base },
          { type: 'punct', text: "'" },
          { type: 'part', segmentId: secondId, text: sMatch[2] },
        ];
      }

      // Possessive noun (e.g., heaven's door, god's plan)
      const segId = this.addSegment([`${baseNorm}s`]);
      return [
        { type: 'part', segmentId: segId, text: base },
        { type: 'punct', text: "'" },
        { type: 'part', segmentId: segId, text: sMatch[2] },
      ];
    }

    // Generic fallback for any other apostrophe word
    const apoParts = word.split("'");
    if (
      apoParts.length > 1 &&
      apoParts.every((part) => normalizeWord(part).length >= 2)
    ) {
      const items: CompoundSubItem[] = [];
      apoParts.forEach((part, idx) => {
        if (idx > 0) {
          items.push({ type: 'punct', text: "'" });
        }
        const segId = this.addSegment([normalizeWord(part)]);
        items.push({ type: 'part', segmentId: segId, text: part });
      });
      return items;
    }

    const fullNorm = normalizeWord(word);
    if (!fullNorm) {
      return [{ type: 'punct', text: word }];
    }
    const segId = this.addSegment([fullNorm]);
    const items: CompoundSubItem[] = [];
    apoParts.forEach((part, idx) => {
      if (idx > 0) {
        items.push({ type: 'punct', text: "'" });
      }
      if (part.length > 0) {
        items.push({ type: 'part', segmentId: segId, text: part });
      }
    });
    return items;
  }
}

/**
 * Parses cleaned lyrics into display tokens and revealable WordSegments,
 * handling punctuation visibility, hyphenated compounds, and contractions.
 */
export function parseLyrics(cleanedLyrics: string): ParsedLyrics {
  const builder = new TokenizerBuilder();
  const normalizedText = normalizeApostrophes(cleanedLyrics);
  const rawLines = normalizedText.split('\n');
  const lines: LineToken[][] = [];

  for (const rawLine of rawLines) {
    if (!rawLine.trim()) {
      lines.push([]);
      continue;
    }

    const chunks = rawLine.trim().match(/\s+|\S+/g) ?? [];
    const lineTokens: LineToken[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (/^\s+$/.test(chunk)) {
        lineTokens.push({ type: 'space', text: ' ' });
        continue;
      }

      // Find normalized text of the next meaningful word on the same line (for 's heuristic)
      let nextWordNorm: string | null = null;
      for (let j = i + 1; j < chunks.length; j++) {
        if (!/^\s+$/.test(chunks[j])) {
          const candidateNorm = normalizeWord(chunks[j]);
          if (candidateNorm.length > 0) {
            nextWordNorm = candidateNorm;
            break;
          }
        }
      }

      const { leadingPunct, core, trailingPunct } = stripOuterPunctuation(chunk);

      if (!core || normalizeWord(core).length === 0) {
        lineTokens.push({ type: 'punct', text: chunk });
        continue;
      }

      const compoundItems: CompoundSubItem[] = [];
      if (leadingPunct) {
        compoundItems.push({ type: 'punct', text: leadingPunct });
      }

      const hyphenParts = core.split(/([-–—]+)/);
      for (const hPart of hyphenParts) {
        if (!hPart) continue;
        if (/^[-–—]+$/.test(hPart)) {
          compoundItems.push({ type: 'punct', text: hPart });
        } else {
          compoundItems.push(...builder.tokenizeSubWord(hPart, nextWordNorm));
        }
      }

      if (trailingPunct) {
        compoundItems.push({ type: 'punct', text: trailingPunct });
      }

      const hasRevealablePart = compoundItems.some((item) => item.type === 'part');
      if (!hasRevealablePart) {
        lineTokens.push({
          type: 'punct',
          text: compoundItems.map((item) => item.text).join(''),
        });
      } else {
        lineTokens.push({ type: 'compound', items: compoundItems });
      }
    }

    lines.push(lineTokens);
  }

  return {
    lines,
    segments: builder.segments,
    keyToSegmentIds: builder.keyToSegmentIds,
  };
}
