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
  // Families and machines are held apart because they are filtered with
  // different catalogue parameters and are never sent together. Selecting a
  // machine clears its family: "PlayStation and also a PS5" is not a request.
  const [platforms, setPlatforms] = useState(["pc"]);
  const [machines, setMachines] = useState([]);
  const [tags, setTags] = useState([]);
  const [openFacet, setOpenFacet] = useState(null);
  const [openFamily, setOpenFamily] = useState(null);

  const [state, setState] = useState({ status: "idle" });
  const [clicked, setClicked] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  const canSubmit =
    (platforms.length > 0 || machines.length > 0) && state.status !== "waiting";

  const selectedTagLabels = useMemo(
    () => FACETS.flatMap(f => f.tags).filter(t => tags.includes(t.slug)).map(t => t.slug),
    [tags]
  );

  // Picking the family means "any of them" and clears anything specific under
  // it. Picking a machine means "this one" and clears the family. Holding both
  // would be a request nobody makes and a query this code will not send.
  function toggleFamily(family) {
    const on = platforms.includes(family.slug);
    setPlatforms(p => (on ? p.filter(x => x !== family.slug) : [...p, family.slug]));
    if (!on) {
      const children = new Set((family.platforms ?? []).map(m => m.slug));
      setMachines(m => m.filter(x => !children.has(x)));
    }
  }

  function toggleMachine(family, machine) {
    const on = machines.includes(machine.slug);
    setMachines(m => (on ? m.filter(x => x !== machine.slug) : [...m, machine.slug]));
    if (!on) setPlatforms(p => p.filter(x => x !== family.slug));
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

    const result = await requestShortlist({ category, platforms, machines, tags });
    clearInterval(ticker);
    setState({ status: "done", result, narrowed: machines.length > 0 });
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
          <div className="families">
            {PLATFORMS.map(p => {
              const familyOn = platforms.includes(p.slug);
              const chosenHere = (p.platforms ?? []).filter(m => machines.includes(m.slug));
              const open = openFamily === p.slug;
              return (
                <div key={p.slug} className={open ? "family open" : "family"}>
                  <div className="family-row">
                    <button
                      type="button"
                      className={familyOn ? "chip on" : "chip"}
                      aria-pressed={familyOn}
                      onClick={() => toggleFamily(p)}
                    >
                      {p.name}
                      {chosenHere.length > 0 && <span className="count">{chosenHere.length}</span>}
                    </button>
                    {(p.platforms ?? []).length > 1 && (
                      <button
                        type="button"
                        className="expand"
                        aria-expanded={open}
                        aria-label={`Choose a specific ${p.name}`}
                        onClick={() => setOpenFamily(open ? null : p.slug)}
                      >
                        {open ? "▾" : "▸"}
                      </button>
                    )}
                  </div>
                  {open && (
                    <div className="chips machines">
                      {p.platforms.map(m => (
                        <button
                          key={m.slug}
                          type="button"
                          className={machines.includes(m.slug) ? "chip small on" : "chip small"}
                          aria-pressed={machines.includes(m.slug)}
                          onClick={() => toggleMachine(p, m)}
                        >
                          {m.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {platforms.length === 0 && machines.length === 0 && (
            <p className="hint warn">Choose at least one.</p>
          )}

          {machines.length > 0 && (
            // Worth saying plainly. Naming a console is a much narrower request
            // than naming a family, and it is the fastest way to an empty
            // result — which criterion 5 will report rather than paper over.
            <p className="hint">
              Searching {machines.length === 1 ? "that console" : "those consoles"} only.
              <span className="quiet"> Far fewer games than the whole family.</span>
            </p>
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

      {state.status === "done" && (
        <Result
          result={state.result}
          narrowed={state.narrowed}
          clicked={clicked}
          onChoose={choose}
        />
      )}

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

function Result({ result, narrowed, clicked, onChoose }) {
  // Criterion 12: a failure is shown as a failure. Never an empty or partial
  // shortlist dressed up as a result.
  if (!result.ok) return <Failure result={result} narrowed={narrowed} />;

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
          Nothing was loosened to fill the gap.{" "}
          {narrowed
            ? "Choosing the whole console family rather than one machine would give more to pick from."
            : "Fewer tags, or another platform, would give more to pick from."}
        </p>
      )}

      {result.picks.map(p => (
        <Pick
          key={p.id}
          pick={p}
          chosen={clicked === p.id}
          onChoose={() => onChoose(p, result.requestId)}
        />
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

function Pick({ pick, chosen, onChoose }) {
  const shots = useMemo(() => {
    // The main image is usually also the first screenshot. Dedupe so the strip
    // does not open with the picture already shown above it.
    const all = [pick.image, ...(pick.screenshots ?? [])].filter(Boolean);
    return [...new Set(all)];
  }, [pick]);

  const [shown, setShown] = useState(0);

  return (
    <article className={chosen ? "pick chosen" : "pick"}>
      <p className="angle">{pick.angleLabel}</p>
      {/* Written by code from the catalogue record, not by the model. Five of
          the six angles have a fact behind them; `beautiful-one` has none and
          gets no line rather than an invented one. */}
      {pick.angleReason && <p className="angle-reason">{pick.angleReason}</p>}

      <h2>
        {pick.title} <span className="year">{pick.released?.slice(0, 4)}</span>
      </h2>

      {shots.length > 0 && (
        <div className="gallery">
          <img src={shots[shown]} alt={`${pick.title} screenshot`} loading="lazy" />
          {shots.length > 1 && (
            <div className="strip">
              {shots.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  className={i === shown ? "thumb on" : "thumb"}
                  onClick={() => setShown(i)}
                  aria-label={`Screenshot ${i + 1} of ${shots.length}`}
                >
                  <img src={s} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* The two blocks below are labelled because they come from different
          places and one of them is checkable. The argument is written by a
          language model and nothing verifies it; the description is the
          catalogue's own. Letting them run together as one voice would hide
          exactly the distinction that makes the second one worth showing. */}
      <p className="case">{pick.case}</p>

      {pick.synopsis && (
        <div className="synopsis">
          <p className="source">What the catalogue says</p>
          <p>{pick.synopsis}</p>
        </div>
      )}

      <p className="facts">
        {pick.platforms.join(" · ")}
        {pick.metacritic ? ` · ${pick.metacritic} metacritic` : ""}
      </p>

      <button
        type="button"
        className={chosen ? "choose chosen" : "choose"}
        onClick={onChoose}
        disabled={chosen}
      >
        {chosen ? "Noted — this one" : "I'll play this one"}
      </button>
    </article>
  );
}

function Failure({ result, narrowed }) {
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
    empty: narrowed
      ? "Nothing in the catalogue matches, or nothing that does is well enough known " +
        "to write about. Naming one console is a narrow request — the whole family " +
        "would give far more to choose from."
      : "Either nothing in the catalogue matches those filters, or what does match is " +
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
