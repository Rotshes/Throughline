import { useState, useMemo } from "react";
import { requestShortlist, recordClick } from "./api.js";

// The three pinned vocabularies, baked in at build time. See vite.config.js for
// why these are imported rather than fetched. Whatever is in these files is the
// entire vocabulary this product understands — spec.md part 5, pitfall 9.
import categoriesFile from "../../data/categories.json";
import platformsFile from "../../data/platforms.json";
import tagsFile from "../../data/tags.json";

// Platforms someone might actually own. The catalogue offers fourteen including
// 3DO, Neo Geo and Commodore/Amiga; showing those makes the form longer and the
// results emptier. Ordered by how likely a person is to be holding one.
const PLATFORM_ORDER = ["pc", "playstation", "xbox", "nintendo", "ios", "android", "mac", "linux", "web"];

const CATEGORIES = categoriesFile.categories;
const PLATFORMS = PLATFORM_ORDER
  .map(slug => platformsFile.platforms.find(p => p.slug === slug))
  .filter(Boolean);
const FACETS = tagsFile.facets;

const MAX_TAGS = 6;

export default function App() {
  const [category, setCategory] = useState("action");
  const [platforms, setPlatforms] = useState(["pc"]);
  const [tags, setTags] = useState([]);
  const [openFacet, setOpenFacet] = useState(null);

  const [state, setState] = useState({ status: "idle" });
  const [clicked, setClicked] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  const canSubmit = platforms.length > 0 && state.status !== "waiting";

  const selectedTagLabels = useMemo(
    () => FACETS.flatMap(f => f.tags).filter(t => tags.includes(t.slug)).map(t => t.slug),
    [tags]
  );

  function togglePlatform(slug) {
    setPlatforms(p => (p.includes(slug) ? p.filter(x => x !== slug) : [...p, slug]));
  }

  function toggleTag(slug) {
    setTags(t => {
      if (t.includes(slug)) return t.filter(x => x !== slug);
      if (t.length >= MAX_TAGS) return t;
      return [...t, slug];
    });
  }

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setClicked(null);
    setState({ status: "waiting" });

    // An honest counter rather than a progress bar. Nothing streams, so a bar
    // would be inventing information the page does not have.
    setElapsed(0);
    const started = Date.now();
    const ticker = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);

    const result = await requestShortlist({ category, platforms, tags });
    clearInterval(ticker);
    setState({ status: "done", result });
  }

  async function choose(pick, requestId) {
    setClicked(pick.id);
    if (requestId) await recordClick(requestId, pick.id);
  }

  return (
    <main>
      <header className="masthead">
        <h1>Throughline</h1>
        <p className="tagline">
          Say what kind of game you want and what you can play it on. Three specific
          answers, and the case for each.
        </p>
      </header>

      <form onSubmit={submit} className="filters">
        <fieldset>
          <legend>What kind of game</legend>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </fieldset>

        <fieldset>
          <legend>What you can play it on</legend>
          <div className="chips">
            {PLATFORMS.map(p => (
              <button
                key={p.slug}
                type="button"
                className={platforms.includes(p.slug) ? "chip on" : "chip"}
                aria-pressed={platforms.includes(p.slug)}
                onClick={() => togglePlatform(p.slug)}
              >
                {p.name}
              </button>
            ))}
          </div>
          {platforms.length === 0 && (
            <p className="hint warn">Choose at least one.</p>
          )}
        </fieldset>

        <fieldset>
          <legend>
            Anything more particular <span className="optional">optional</span>
          </legend>
          <div className="facets">
            {FACETS.map(f => {
              const chosenHere = f.tags.filter(t => tags.includes(t.slug)).length;
              const open = openFacet === f.id;
              return (
                <div key={f.id} className="facet">
                  <button
                    type="button"
                    className={open ? "facet-head open" : "facet-head"}
                    onClick={() => setOpenFacet(open ? null : f.id)}
                    aria-expanded={open}
                  >
                    {f.label}
                    {chosenHere > 0 && <span className="count">{chosenHere}</span>}
                  </button>
                  {open && (
                    <div className="chips">
                      {f.tags.map(t => {
                        const on = tags.includes(t.slug);
                        const full = !on && tags.length >= MAX_TAGS;
                        return (
                          <button
                            key={t.slug}
                            type="button"
                            className={on ? "chip on" : "chip"}
                            aria-pressed={on}
                            disabled={full}
                            onClick={() => toggleTag(t.slug)}
                          >
                            {t.slug.replace(/-/g, " ")}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {tags.length > 0 && (
            <p className="hint">
              {selectedTagLabels.join(", ")}
              {tags.length > 1 && (
                <>
                  {" — "}
                  <span className="quiet">
                    games matching more of these come first; games matching one still appear
                  </span>
                </>
              )}
            </p>
          )}
          {tags.length >= MAX_TAGS && <p className="hint warn">Six at most.</p>}
        </fieldset>

        <button type="submit" className="go" disabled={!canSubmit}>
          {state.status === "waiting" ? "Looking…" : "Find me three"}
        </button>
      </form>

      {state.status === "waiting" && (
        <section className="waiting">
          <p>Reading the catalogue, then asking the model once.</p>
          <p className="quiet">Usually 8–20 seconds. {elapsed}s so far.</p>
        </section>
      )}

      {state.status === "done" && <Result result={state.result} clicked={clicked} onChoose={choose} />}

      <footer>
        {/* Required by RAWG's free tier: an active link back to them from every
            page that shows their data. A licence condition, not a courtesy. */}
        <p>
          Game data and images from{" "}
          <a href="https://rawg.io/" target="_blank" rel="noreferrer">RAWG</a>.
        </p>
        <p className="quiet">
          ASE-26 coursework. The three arguments are written by a language model
          from a candidate set this app assembled; it is told to describe only what
          you could see for yourself, and nothing checks whether it succeeded.
        </p>
      </footer>
    </main>
  );
}

function Result({ result, clicked, onChoose }) {
  // Criterion 12: a failure is shown as a failure. Never an empty or partial
  // shortlist dressed up as a result.
  if (!result.ok) return <Failure result={result} />;

  const m = result.meta ?? {};
  const thin = result.picks.length < 3;

  return (
    <section className="results">
      {/* Pitfall 10 reaching a person. Criterion 5 forbids padding a thin
          result, so the honest alternative is saying it is thin. A shortlist
          drawn from a pool barely larger than itself is not a choice, and
          leaving that in the small grey line at the bottom would let it read
          as one. */}
      {thin && (
        <p className="thin">
          {result.picks.length === 1
            ? "Only one game matched those filters, so there is nothing to choose between."
            : `Only ${result.picks.length} games matched those filters.`}{" "}
          Nothing was loosened to fill the gap. Fewer tags, or another platform,
          would give more to pick from.
        </p>
      )}

      {result.picks.map(p => (
        <article key={p.id} className={clicked === p.id ? "pick chosen" : "pick"}>
          <p className="angle">{p.angleLabel}</p>
          <h2>
            {p.title} <span className="year">{p.released?.slice(0, 4)}</span>
          </h2>
          {p.image && <img src={p.image} alt={`${p.title} screenshot`} loading="lazy" />}
          <p className="case">{p.case}</p>
          <p className="facts">
            {p.platforms.join(" · ")}
            {p.metacritic ? ` · ${p.metacritic} metacritic` : ""}
          </p>
          <button
            type="button"
            className={clicked === p.id ? "choose chosen" : "choose"}
            onClick={() => onChoose(p, result.requestId)}
            disabled={clicked === p.id}
          >
            {clicked === p.id ? "Noted — this one" : "I'll play this one"}
          </button>
        </article>
      ))}

      <p className="meta">
        Chosen from {m.candidateCount ?? "?"} candidates
        {m.shownFrom ? ` (the catalogue holds ${m.shownFrom} for those filters)` : ""}
        {m.callsUsed != null ? ` · ${m.callsUsed} of ${m.callCap} model calls` : ""}
        {m.latencyMs ? ` · ${(m.latencyMs / 1000).toFixed(1)}s` : ""}
        {m.prompt ? ` · ${m.prompt}` : ""}
      </p>
      {m.recording && m.recording.ok === false && (
        <p className="meta warn">
          This result was not recorded: {m.recording.reason}
        </p>
      )}
    </section>
  );
}

function Failure({ result }) {
  // Each stage gets its own words. With two external services behind this, a
  // person who cannot tell which one broke cannot report anything useful —
  // criterion 13. "Something went wrong" is the message that helps nobody.
  const stage = result.stage;

  const headings = {
    empty: "Nothing to show you",
    catalogue: "The game database did not answer",
    gate: "The model's answer was rejected",
    parse: "The model's answer could not be read",
    schema: "The model's answer was the wrong shape",
    budget: "Stopped before spending more",
    call: "The model did not answer",
    server: "The server failed",
    request: "That request was refused",
    unexpected: "Something failed unexpectedly",
  };

  const explanations = {
    empty:
      "Either nothing in the catalogue matches those filters, or what does match is " +
      "too obscure to write about honestly. Try fewer tags, or another platform.",
    catalogue:
      "That is the game database, not the model. Nothing was asked of the model and " +
      "nothing was spent. It is usually worth trying again in a minute.",
    gate:
      "The model returned three games, and the checks refused them. That is the system " +
      "working: a shortlist that fails a check is not shown as a partial result.",
    budget: "The per-request cap on model calls was reached. Nothing further was spent.",
  };

  return (
    <section className="failure">
      <h2>{headings[stage] ?? "That did not work"}</h2>
      {explanations[stage] && <p>{explanations[stage]}</p>}
      <p className="reason">{result.failureReason}</p>
      {result.problems?.length > 0 && (
        <ul className="problems">
          {result.problems.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
      {result.meta?.recording && result.meta.recording.ok === false && (
        <p className="meta warn">This failure was not recorded: {result.meta.recording.reason}</p>
      )}
    </section>
  );
}
