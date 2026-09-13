import { useEffect, useRef, useState } from "react";
import { fetchHome, fetchDeals, searchDeal, fetchEventGames } from "./api.js";
import { longDate } from "./GameDialog.jsx";
import { useDrift } from "./useDrift.js";

/**
 * The front page.
 *
 * Every row says where it came from, under its own heading. That is not
 * decoration: "out in the last ninety days, ordered by how many people rated it"
 * and "popular right now" are different claims, and only one of them is true of
 * this data.
 *
 * One row a site like this usually carries is absent on purpose. Live player
 * counts are Steam's, not the catalogue's. Saying so is better than
 * approximating it.
 */
export default function Home({ inLibrary, busyId, onAdd, onOpen, onFind }) {
  const [state, setState] = useState({ status: "loading" });
  // The showcase somebody opened, or null.
  const [event, setEvent] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchHome().then(home => { if (alive) setState({ status: "done", home }); });
    return () => { alive = false; };
  }, []);

  if (state.status === "loading") {
    return (
      <section className="home">
        <div className="shimmer" aria-hidden="true" />
        <p className="quiet">Reading the catalogue.</p>
      </section>
    );
  }

  const home = state.home;

  if (home.ok === false) {
    return (
      <section className="failure">
        <h2>The game database did not answer</h2>
        <p>
          That is the catalogue, not the model. Nothing was asked of the model
          and nothing was spent. Finding a game still works.
        </p>
        <p className="reason">{home.reason}</p>
        <button type="button" className="go" onClick={onFind}>Find a game instead</button>
      </section>
    );
  }

  return (
    <section className="home">
      {home.rows.map(row => (
        <div key={row.id} className="row">
          <h2>{row.title}</h2>
          <p className="row-source">{row.source}</p>

          {row.games.length === 0 ? (
            <p className="quiet">Nothing here yet.</p>
          ) : row.events ? (
            <EventRail row={row} onOpen={setEvent} />
          ) : row.list ? (
            // Prices belong in a column. A row of twelve cards makes you carry
            // "$13.50, was $59.99" in your head to compare it with the next one;
            // stacked, the eye does it. The drifting rails are for browsing and
            // this is for choosing, so it does not drift either.
            <DealList
              row={row}
              inLibrary={inLibrary}
              busyId={busyId}
              onAdd={onAdd}
              onOpen={onOpen}
            />
          ) : (
            <Rail
              row={row}
              inLibrary={inLibrary}
              busyId={busyId}
              onAdd={onAdd}
              onOpen={onOpen}
            />
          )}
        </div>
      ))}

      {home.failures?.length > 0 && (
        // A dead row is reported rather than silently missing. A page with two
        // rows instead of three looks exactly like a page that only ever had
        // two.
        //
        // Not "could not be loaded from the catalogue" any more. A row can also
        // be missing because everything the catalogue sent was discarded here,
        // which is this project's fault rather than theirs, and saying the wrong
        // one sends anyone debugging it to the wrong place.
        <p className="meta warn">
          {home.failures.length === 1 ? "One section is" : `${home.failures.length} sections are`}{" "}
          missing: {home.failures.map(f => f.reason).join("; ")}.
        </p>
      )}

      <EventSheet
        event={event}
        inLibrary={inLibrary}
        busyId={busyId}
        onAdd={onAdd}
        onOpenGame={onOpen}
        onClose={() => setEvent(null)}
      />

      {/*
        The IGDB and IsThereAnyDeal credit used to be repeated here. It is a
        licence term, not a caption, and one statement in the footer satisfies it
        on every page — saying it twice on one page is noise, not compliance.

        What stays is the only thing on this line that was ever about the home
        page: how old these rows are. The page is cached for half an hour and
        "why is this the same as an hour ago" has a visible answer.
      */}
      {home.cachedFor > 0 && (
        <p className="meta">
          Built {Math.round(home.cachedFor / 60)} minutes ago.
        </p>
      )}
    </section>
  );
}

/**
 * Which band a discount falls in.
 *
 * The colour is REINFORCEMENT, never the signal. The number is printed inside
 * the chip, so somebody who cannot separate the reds from the oranges — which is
 * roughly one man in twelve — loses nothing at all. A scale where the colour
 * carried the meaning on its own would be a scale that excluded them.
 *
 * The bands are where a shopper's attention actually changes, not equal
 * quarters: a three-quarters-off is a different kind of event from a tenth off,
 * and 25 and 50 are the two numbers people already round to.
 */
export function cutTier(cut) {
  if (!Number.isFinite(cut) || cut <= 0) return "flat";
  if (cut >= 75) return "hot";
  if (cut >= 50) return "high";
  if (cut >= 25) return "mid";
  return "low";
}

/**
 * Money, formatted by the browser rather than by hand.
 *
 * `$2.49` is easy and `Intl` is still the right call: it knows that a currency
 * symbol goes on different sides in different places, and the alternative is a
 * template string that is correct for exactly one currency and silently wrong
 * for the next one this row shows.
 */
function money(amount, currency = "USD") {
  if (!Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount}`;
  }
}

/**
 * Showcases, as a rail of logos.
 *
 * Deliberately does not drift. The other two rails move because you are scanning
 * art; these are twelve wide logos with names on them, and a row of text sliding
 * sideways is a row nobody finishes reading.
 */
function EventRail({ row, onOpen }) {
  return (
    <ul className="rail events">
      {row.games.map(e => (
        <li key={e.id} className="event-item">
          <button
            type="button"
            className="event-open"
            onClick={() => onOpen(e)}
            aria-label={`${e.name} — ${e.gameCount} games`}
          >
            <img className="event-logo" src={e.logo} alt="" loading="lazy" />
            <span className="event-name">{e.name}</span>
            <span className="event-sub">
              {e.startedAt ? longDate(e.startedAt) : null}
              {` · ${e.gameCount} game${e.gameCount === 1 ? "" : "s"}`}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * One showcase, opened.
 *
 * The games inside are the same cards as everywhere else, carrying the same Add
 * button — which is the whole reason this row belongs in this app rather than
 * being a link to somebody else's video.
 */
function EventSheet({ event, inLibrary, busyId, onAdd, onOpenGame, onClose }) {
  const ref = useRef(null);
  const [state, setState] = useState({ status: "loading" });

  const id = event?.id;

  useEffect(() => {
    if (!id) return;
    setState({ status: "loading" });
    let alive = true;
    fetchEventGames(id).then(r => { if (alive) setState({ status: "done", result: r }); });
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (id && !el.open) el.showModal();
    if (!id && el.open) el.close();
  }, [id]);

  if (!id) return null;

  const result = state.status === "done" ? state.result : null;
  const games = result?.ok ? result.games : [];

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={event.name}
      onClose={onClose}
      onClick={e => { if (e.target === ref.current) onClose(); }}
    >
      <div className="sheet-inner">
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">×</button>

        {event.logo && (
          <div className="sheet-art">
            <img src={event.logo} alt="" />
          </div>
        )}

        <div className="sheet-body">
          <h2>{event.name}</h2>
          <p className="sheet-facts">
            {event.startedAt ? longDate(event.startedAt) : null}
            {` · ${event.gameCount} game${event.gameCount === 1 ? "" : "s"} shown`}
          </p>

          {state.status === "loading" && (
            <>
              <div className="shimmer" aria-hidden="true" />
              <p className="quiet">Reading the catalogue.</p>
            </>
          )}

          {result && !result.ok && (
            <p className="reason">
              {result.stage === "catalogue"
                ? "The game database did not answer. Nothing was asked of the model."
                : result.reason}
            </p>
          )}

          {result?.ok && games.length === 0 && (
            // Not the same as "this showcase had no games". The panel filters to
            // games with a cover and an audience, and saying which is why keeps
            // an honest number from reading as an empty event.
            <p className="quiet">
              None of the {result.totalGames} games from this showcase is well enough
              known yet for a card. That is this app being strict, not the showcase
              being empty.
            </p>
          )}

          {games.length > 0 && (
            <>
              {result.totalGames > games.length && (
                <p className="quiet">
                  {games.length} of {result.totalGames}, the most rated first.
                </p>
              )}
              <ul className="rail event-games">
                {games.map(g => (
                  <li key={g.id} className="rail-item">
                    <button
                      type="button"
                      className="rail-open"
                      onClick={() => { onClose(); onOpenGame(g); }}
                      aria-label={`More about ${g.title}`}
                    >
                      <div className="rail-art">
                        {(g.cover ?? g.image)
                          ? <img src={g.cover ?? g.image} alt="" loading="lazy" />
                          : <div className="rail-noart" aria-hidden="true" />}
                      </div>
                      <p className="rail-title">{g.title}</p>
                      <p className="rail-facts">
                        {g.released?.slice(0, 4)}
                        {g.platforms?.length ? ` · ${g.platforms.slice(0, 2).join(" · ")}` : ""}
                      </p>
                    </button>
                    {inLibrary.has(g.id) ? (
                      <span className="rail-in">In your library</span>
                    ) : (
                      <button
                        type="button"
                        className="rail-add"
                        disabled={busyId === g.id}
                        onClick={() => onAdd(g)}
                      >
                        {busyId === g.id ? "Adding…" : "Add"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="sheet-actions">
            {/* Only live_stream_url. event_networks carries more links keyed by a
                network_type this project has not resolved, and rendering a
                Twitter link as "watch it" would be a small lie with no upside. */}
            {event.stream && (
              <a className="sheet-link" href={event.stream} target="_blank" rel="noreferrer">
                Watch the stream
              </a>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}

/**
 * The deals list.
 *
 * One game per line: cover, title, what it costs, where. Nothing here moves,
 * because comparing prices is a reading task and reading a moving list is not a
 * task anyone enjoys.
 *
 * The whole left side opens the game and the actions sit outside it, for the
 * same reason as the rails: a button inside a button is invalid markup and the
 * inner one stops being reachable by keyboard.
 */
function DealList({ row, inLibrary, busyId, onAdd, onOpen }) {
  const [state, setState] = useState({
    games: row.games,
    window: row.window ?? 0,
    busy: false,
    reason: null,
    // What is on screen: the browsing list, or the answer to a question.
    searched: null,
    unpriceable: [],
  });
  const [query, setQuery] = useState("");

  async function shuffle() {
    setState(s => ({ ...s, busy: true, reason: null }));
    const next = await fetchDeals(state.window + 1);
    setState(s =>
      next.ok
        // A window where nothing is discounted is a real answer. Keeping the
        // previous list and saying so beats replacing it with an empty box that
        // looks like a failure.
        ? next.games.length
          ? { ...s, games: next.games, window: next.window ?? s.window + 1, busy: false, reason: null, searched: null, unpriceable: [] }
          : {
              ...s,
              window: next.window ?? s.window + 1,
              busy: false,
              searched: null,
              reason: `Nothing in that batch of ${next.sampled ?? "games"} is discounted right now. Showing the previous set.`,
            }
        : { ...s, busy: false, reason: next.reason }
    );
  }

  async function search(e) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2 || state.busy) return;

    setState(s => ({ ...s, busy: true, reason: null }));
    const found = await searchDeal(q);

    if (!found.ok) {
      setState(s => ({ ...s, busy: false, reason: found.reason }));
      return;
    }
    setState(s => ({
      ...s,
      busy: false,
      games: found.games,
      searched: found.query ?? q,
      unpriceable: found.unpriceable ?? [],
      reason: found.games.length === 0
        ? (found.unpriceable?.length
            // Two different answers that would otherwise both render as an
            // empty list: we found the game and cannot price it, versus we did
            // not find it at all.
            ? `Found ${found.unpriceable.join(", ")}, but with no PC release these prices cover.`
            : "Nothing in the catalogue matched that.")
        : null,
    }));
  }

  function backToBrowsing() {
    setQuery("");
    setState(s => ({ ...s, games: row.games, window: row.window ?? 0, searched: null, reason: null, unpriceable: [] }));
  }

  return (
    <>
      <div className="deals-bar">
        <button type="button" className="deals-refresh" onClick={shuffle} disabled={state.busy}>
          {state.busy ? "Pricing…" : "Show me different games"}
        </button>

        <form className="deals-search" onSubmit={search} role="search">
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Is a game on sale?"
            aria-label="Search for a game's price"
          />
          <button type="submit" disabled={state.busy || query.trim().length < 2}>
            Search
          </button>
        </form>

        {state.searched && (
          <button type="button" className="deals-clear" onClick={backToBrowsing}>
            Back to the deals
          </button>
        )}
      </div>

      {state.searched && (
        // Said plainly, because a search result and a browse list look the same
        // and mean different things — one of these may be at full price.
        <p className="deals-note">
          Prices for “{state.searched}”, discounted or not.
          {state.unpriceable.length > 0 &&
            ` Also matched ${state.unpriceable.join(", ")}, which these prices do not cover.`}
        </p>
      )}

    <ul className="deals">
      {state.games.map(g => (
        <li key={g.id} className="deal">
          <button
            type="button"
            className="deal-open"
            onClick={() => onOpen(g)}
            aria-label={`More about ${g.title}`}
          >
            {(g.cover ?? g.image)
              ? <img className="deal-art" src={g.cover ?? g.image} alt="" loading="lazy" />
              : <span className="deal-art deal-noart" aria-hidden="true" />}
            <span className="deal-name">
              <span className="deal-title">{g.title}</span>
              <span className="deal-sub">
                {g.released?.slice(0, 4)}
                {g.criticScore != null ? ` · ${g.criticScore} from ${g.criticReviews} critics` : ""}
                {g.platforms?.length ? ` · ${g.platforms.slice(0, 3).join(" · ")}` : ""}
              </span>
            </span>
          </button>

          <span className="deal-money">
            {g.price.cut > 0
              ? (
                <span className={`price-cut cut-${cutTier(g.price.cut)}`}>
                  -{g.price.cut}%
                </span>
              )
              : <span className="price-flat">full price</span>}
            <span className="deal-amounts">
              <span className="price-now">{money(g.price.now, g.price.currency)}</span>
              <span className="price-was">{money(g.price.was, g.price.currency)}</span>
            </span>
            {g.price.shop && <span className="deal-shop">{g.price.shop}</span>}
          </span>

          <span className="deal-actions">
            {/* Their link, unaltered. ITAD's terms forbid stripping the
                affiliate tags out of it. */}
            {g.price.buyUrl && (
              <a className="deal-buy" href={g.price.buyUrl} target="_blank" rel="noreferrer">
                Buy
              </a>
            )}
            {inLibrary.has(g.id) ? (
              <span className="deal-in" title="In your library">On your list</span>
            ) : (
              <button
                type="button"
                className="rail-add"
                disabled={busyId === g.id}
                onClick={() => onAdd(g)}
              >
                {busyId === g.id ? "Adding…" : "Add"}
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
    </>
  );
}

/**
 * One drifting row.
 *
 * The games are rendered TWICE. That is what makes the loop seamless: when the
 * scroll passes the halfway point, `useDrift` subtracts half the width and lands
 * on an identical pixel. A rail that reached the end and sprang back to the
 * start would draw the eye to the one moment worth not noticing.
 *
 * The second copy is `aria-hidden` and untabbable. It is the same twelve games,
 * and a screen reader announcing twenty-four, or the tab key walking through
 * each game twice, would be the price of a visual effect — paid by the people
 * least able to see it.
 *
 * The suggestions row does not drift. It is this project's own record rather
 * than a catalogue listing, it is usually short, and a row that fits on screen
 * has nowhere to drift to.
 */
function Rail({ row, inLibrary, busyId, onAdd, onOpen }) {
  const drifting = !row.plain && row.games.length >= 6;
  const ref = useDrift(drifting ? 14 : 0);

  const copies = drifting ? [false, true] : [false];

  return (
    <ul
      className={`rail${row.plain ? " plain" : ""}${drifting ? " drifting" : ""}`}
      ref={drifting ? ref : undefined}
    >
      {copies.map(isClone =>
        row.games.map(g => (
          <li
            key={isClone ? `clone-${g.id}` : g.id}
            className="rail-item"
            aria-hidden={isClone || undefined}
          >
            {/* The card opens the game; "Add" is its own control beside it.
                One button inside another is invalid markup and the inner one
                stops being reachable by keyboard, so they are siblings. */}
            <button
              type="button"
              className={row.plain ? "rail-open plain" : "rail-open"}
              onClick={() => onOpen(g)}
              tabIndex={isClone ? -1 : undefined}
              aria-label={`More about ${g.title}`}
            >
              {row.plain ? (
                <div className="rail-plain">
                  {g.angleLabel && <p className="rail-angle">{g.angleLabel}</p>}
                  <p className="rail-title">{g.title}</p>
                </div>
              ) : (
                <>
                  {/* Box art, not a screenshot. A rail is a shelf and a shelf
                      wants covers — it is how a person recognises a game at a
                      glance, and it is what the art was drawn for. The card
                      still carries the screenshot under `image`: the dialog's
                      frame is 16:9 and wants that one. */}
                  <div className="rail-art">
                    {(g.cover ?? g.image)
                      ? <img src={g.cover ?? g.image} alt="" loading="lazy" />
                      : <div className="rail-noart" aria-hidden="true" />}
                    {row.showScore && g.criticScore != null && (
                      <span
                        className="rail-score"
                        title={`${g.criticReviews} critic${g.criticReviews === 1 ? "" : "s"}`}
                      >
                        {g.criticScore}
                      </span>
                    )}
                  </div>
                  <p className="rail-title">{g.title}</p>
                  {row.showPrice && g.price && (
                    <p className="rail-price">
                      <span className="price-now">
                        {money(g.price.now, g.price.currency)}
                      </span>
                      <span className="price-was">
                        {money(g.price.was, g.price.currency)}
                      </span>
                      {g.price.cut > 0
              ? (
                <span className={`price-cut cut-${cutTier(g.price.cut)}`}>
                  -{g.price.cut}%
                </span>
              )
              : <span className="price-flat">full price</span>}
                    </p>
                  )}
                  <p className="rail-facts">
                    {/* A row where every game came out in the same year has no
                        use for the year. Rows that span time keep it — the row
                        says which it is rather than this guessing from the
                        data. */}
                    {row.fullDate ? longDate(g.released) : g.released?.slice(0, 4)}
                    {g.platforms?.length ? ` · ${g.platforms.slice(0, 3).join(" · ")}` : ""}
                  </p>
                </>
              )}
            </button>

            {/* Their link, unaltered. ITAD's terms forbid stripping the
                affiliate tags out of it, and rebuilding it as a direct store
                link would be the same breach wearing a disguise. */}
            {row.showPrice && g.price?.buyUrl && (
              <a
                className="rail-buy"
                href={g.price.buyUrl}
                target="_blank"
                rel="noreferrer"
                tabIndex={isClone ? -1 : undefined}
              >
                {g.price.shop ? `Buy on ${g.price.shop}` : "Where to buy"}
              </a>
            )}

            {!row.plain && (
              inLibrary.has(g.id) ? (
                <span className="rail-in">In your library</span>
              ) : (
                <button
                  type="button"
                  className="rail-add"
                  disabled={busyId === g.id}
                  tabIndex={isClone ? -1 : undefined}
                  onClick={() => onAdd(g)}
                >
                  {busyId === g.id ? "Adding…" : "Add"}
                </button>
              )
            )}
          </li>
        ))
      )}
    </ul>
  );
}
