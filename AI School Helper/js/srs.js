/**
 * srs.js — spaced repetition (SM-2 style)
 *
 * Each flashcard stores ease factor, interval (days), repetition count, and
 * nextReview (timestamp). When you rate a card (Again / Hard / Good / Easy),
 * scheduleReview updates those fields so harder cards come back sooner.
 */

/**
 * SM-2 spaced repetition (quality 0–5).
 * @param {number} quality User grade: Again≈1, Hard≈3, Good≈4, Easy≈5
 * @param {{ easeFactor: number, interval: number, repetitions: number }} card
 * @returns {{ easeFactor: number, interval: number, repetitions: number, nextReview: number }}
 */
export function scheduleReview(quality, card) {
  let { easeFactor = 2.5, interval = 0, repetitions = 0 } = card;
  const q = Math.min(5, Math.max(0, quality));

  // Failed recall: reset progress; card is due again after 1 day in our model.
  if (q < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    // SM-2 intervals: 1 day, then 6 days, then interval × ease factor.
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    repetitions += 1;
  }

  // Adjust ease factor based on how well the user knew the card.
  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const dayMs = 24 * 60 * 60 * 1000;
  const nextReview = Date.now() + interval * dayMs;

  return { easeFactor, interval, repetitions, nextReview };
}

/** Starting metadata for a card that has never been reviewed. */
export function defaultSrsMeta() {
  return {
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReview: 0, // 0 means “due now” in the UI
  };
}

/** True if the card should appear in the current study session. */
export function isDue(meta) {
  if (!meta || meta.nextReview === undefined) return true;
  return meta.nextReview <= Date.now();
}
