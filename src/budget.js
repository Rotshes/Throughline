/**
 * Criterion 11. A hard cap on model calls per user request.
 *
 * Counted across the whole request, not per stage. Two stages that each retry
 * once is four calls, and without a shared counter nothing notices. The cap is
 * what stops a loop, a bad retry condition, or a future third stage from
 * spending without anyone watching — Module 9's economic blast radius.
 */
export function createBudget(max) {
  let used = 0;
  return {
    max,
    get used() { return used; },
    get remaining() { return max - used; },
    /** Returns false when the cap is reached. The caller must abort, not retry. */
    spend() {
      if (used >= max) return false;
      used += 1;
      return true;
    },
  };
}
