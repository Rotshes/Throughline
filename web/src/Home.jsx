import { useEffect, useState } from "react";
import { fetchHome } from "./api.js";
import { longDate } from "./GameDialog.jsx";

/**
 * The front page.
 *
 * Every row says where it came from, under its own heading. That is not
 * decoration: "out in the last ninety days, ordered by how many people added
 * it" and "popular right now" are different claims, and only one of them is
 * true of this data.
 *
 * Two rows a site like this usually carries are absent on purpose. Live player
 * counts are Steam's, not the catalogue's; prices and deals are a paid tier.
 * Saying so is better than approximating either.
 */
export default function Home({ inLibrary, busyId, onAdd, onOpen, onFind }) {
  const [state, setState] = useState({ status: "loading" });

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
          ) : (
            <ul className={row.plain ? "rail plain" : "rail"}>
              {row.games.map(g => (
                // The card opens the game; "Add" is its own control beside it.
                // One button inside another is invalid markup and the inner one
                // stops being reachable by keyboard, so they are siblings.
                <li key={g.id} className="rail-item">
                  <button
                    type="button"
                    className={row.plain ? "rail-open plain" : "rail-open"}
                    onClick={() => onOpen(g)}
                    aria-label={`More about ${g.title}`}
                  >
                    {row.plain ? (
                      <div className="rail-plain">
                        {g.angleLabel && <p className="rail-angle">{g.angleLabel}</p>}
                        <p className="rail-title">{g.title}</p>
                      </div>
                    ) : (
                      <>
                        <div className="rail-art">
                          {g.image
                            ? <img src={g.image} alt="" loading="lazy" />
                            : <div className="rail-noart" aria-hidden="true" />}
                          {g.metacritic != null && (
                            <span className="rail-score">{g.metacritic}</span>
                          )}
                        </div>
                        <p className="rail-title">{g.title}</p>
                        <p className="rail-facts">
                          {/* A row where every game came out in the same year
                              has no use for the year. Rows that span time keep
                              it — the row says which it is rather than this
                              guessing from the data. */}
                          {row.fullDate ? longDate(g.released) : g.released?.slice(0, 4)}
                          {g.platforms?.length ? ` · ${g.platforms.slice(0, 3).join(" · ")}` : ""}
                        </p>
                      </>
                    )}
                  </button>

                  {!row.plain && (
                    inLibrary.has(g.id) ? (
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
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {home.failures?.length > 0 && (
        // A dead row is reported rather than silently missing. A page with two
        // rows instead of three looks exactly like a page that only ever had
        // two.
        // Not "could not be loaded from the catalogue" any more. A row can also
        // be missing because everything the catalogue sent was discarded here,
        // which is this project's fault rather than theirs, and saying the wrong
        // one sends anyone debugging it to the wrong place.
        <p className="meta warn">
          {home.failures.length === 1 ? "One section is" : `${home.failures.length} sections are`}{" "}
          missing: {home.failures.map(f => f.reason).join("; ")}.
        </p>
      )}

      <p className="meta">
        Game data and images from RAWG.
        {home.cachedFor > 0 && ` Built ${Math.round(home.cachedFor / 60)} minutes ago.`}
      </p>
    </section>
  );
}
