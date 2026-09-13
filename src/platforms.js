/**
 * Turning what someone ticked into what the catalogue is asked for.
 *
 * This is four lines of logic that has been wrong twice, both times in a way no
 * check could catch, because it lived inside the Netlify handler where no
 * offline test could reach it. It lives here now, pure and exported, for that
 * reason alone.
 *
 * The two failures, recorded because the shape of them matters more than either:
 *
 *   1. The query expanded a selected family to its machines and the gate did
 *      not, so a request for "PC or Game Boy Advance" asked the catalogue for
 *      PC games and then rejected every one of them. The query and the check
 *      disagreed.
 *   2. Both were then derived from one list — and that list was still built by a
 *      rule written for an earlier interface, where choosing a console
 *      deselected its family. The interface changed; the rule did not. A request
 *      for a Game Boy Advance game returned Breath of the Wild, and the gate
 *      agreed, because it had been handed the same wrong answer.
 *
 * One source stops a disagreement. It does not make the source correct.
 */

/**
 * @param {object} input
 * @param {string[]} input.familySlugs   families the person chose
 * @param {string[]} input.machineSlugs  machines they narrowed to, if any
 * @param {(familySlug: string) => string[]} input.childrenOf
 *
 * @returns {{specific: boolean, machines: string[], selection: string[]}}
 *   `machines` is what the catalogue query filters on and therefore what the
 *   gate must accept — the two are the same statement said twice.
 *   `selection` is what the person asked for, for the record and the prompt:
 *   "playstation" when a family was left whole, "playstation5" when it was not.
 *   Never both, because "PlayStation, PlayStation 5" describes no request.
 */
export function resolvePlatforms({ familySlugs = [], machineSlugs = [], childrenOf }) {
  const specific = machineSlugs.length > 0;

  if (!specific) {
    return { specific: false, machines: [], selection: [...new Set(familySlugs)] };
  }

  const machines = [];
  const selection = [];

  for (const family of familySlugs) {
    const children = childrenOf(family) ?? [];
    const narrowed = children.filter(c => machineSlugs.includes(c));

    // Narrowed means those machines and no others. Left whole means the family,
    // expanded — because only one catalogue parameter goes out per request and
    // in this mode it is the machine one.
    machines.push(...(narrowed.length ? narrowed : children));
    selection.push(...(narrowed.length ? narrowed : [family]));
  }

  // A machine whose family was not selected cannot come from the interface.
  // Honoured rather than dropped: silently discarding part of a request is
  // worse than serving one the form cannot produce.
  for (const m of machineSlugs) {
    if (!machines.includes(m)) machines.push(m);
    if (!selection.includes(m)) selection.push(m);
  }

  return {
    specific: true,
    machines: [...new Set(machines)],
    selection: [...new Set(selection)],
  };
}
