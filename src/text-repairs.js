// Corrections to scanning damage in the source translation text.
//
// These are transcription faults, not editorial changes: in each case the
// intended wording is fixed by evidence inside the corpus itself, and the same
// damage is present in the published site's copy of the database. Applied by
// the migration so re-importing cannot reintroduce them, and by
// `scripts/repair-verses.js` for a database that is already loaded.

export const VERSE_REPAIRS = [
  // The vocative "O" was scanned as the digit zero in parentheses, which the
  // reader then renders as a footnote badge "0" mid-sentence. Footnote 0 does
  // not exist in any surah, and the same construction survives intact
  // elsewhere in the same translation — 21:112 "O my Sustainer!", 22:1 "O MEN!".
  { surah: 21, verse: 69, from: '"(0) fire!', to: '"O fire!' },
  { surah: 22, verse: 49, from: '"(0) men!', to: '"O men!' },
  { surah: 25, verse: 30, from: '"(0) my Sustainer!', to: '"O my Sustainer!' },

  // "hell(43)" was scanned as "he(1143)": the "ll" of "hell" became "11" and
  // was absorbed into the footnote marker. Three things fix the reading —
  // surah 26 has only 102 footnotes so 1143 refers to nothing; the markers run
  // (42) in verse 93 and (44) in verse 95, leaving 43 for this verse; and
  // footnote 43 reads 'Lit., "into it".', which is a note on the word "hell".
  // The Malayalam translation of the same verse carries the marker [^43].
  { surah: 26, verse: 94, from: 'hurled into he(1143)', to: 'hurled into hell(43)' },
];

/// Returns the repaired text for a verse, or the text unchanged.
export const repairVerseText = (surahNumber, verseNumber, text) => {
  let out = text;
  for (const r of VERSE_REPAIRS) {
    if (r.surah === surahNumber && r.verse === verseNumber && out.includes(r.from)) {
      out = out.replace(r.from, r.to);
    }
  }
  return out;
};
