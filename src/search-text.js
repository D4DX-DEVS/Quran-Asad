// Normalisation shared by the migration script (which precomputes the search
// columns) and the search routes (which normalise the incoming query the same
// way). Both sides must agree or nothing matches.

const ALEF = 0x627;
const ALEF_VARIANTS = new Set([0x622, 0x623, 0x625, 0x671]);
const DIACRITICS = new Set([
  ...Array.from({ length: 0x655 - 0x64b + 1 }, (_, i) => 0x64b + i),
  0x670,
  0x640,
]);

// Mirrors normalizeArabic(): 13 diacritic removals, then 4 Alef variants → ا.
export const normalizeArabic = (text) =>
  Array.from(text ?? '')
    .map((ch) => {
      const code = ch.codePointAt(0);
      if (DIACRITICS.has(code)) return '';
      return ALEF_VARIANTS.has(code) ? String.fromCharCode(ALEF) : ch;
    })
    .join('');

// The punctuation-stripping REPLACE chain the sqlite queries applied to
// translation and footnote text, so a word next to `.,;:!?()` still matches.
export const stripPunctuation = (text) =>
  (text ?? '').toLowerCase().replace(/[.,;:!?()]/g, ' ');

// The shorter REPLACE chain the Malayalam footnote query applied: `,.)(;` and
// newlines, but not `:!?`.
export const stripFootnotePunctuation = (text) =>
  (text ?? '').toLowerCase().replace(/[,.);(\n]/g, ' ');

// Every search compared `' ' || column || ' '` against `'% term %'`, i.e. a
// whole-word substring match. Padding at write time makes the runtime query a
// plain substring test.
export const pad = (text) => ` ${text} `;

// The sqlite queries used LIKE with `%…%`; the Mongo equivalent is a regex, so
// the needle has to be escaped down to a literal substring match.
export const contains = (text) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
