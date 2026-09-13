/**
 * Are gaming news feeds actually fetchable from a server, and what shape are
 * they?
 *
 * Nothing about this can be answered from a documentation page. Three things
 * have to be true before a news row is worth building, and only one of them is
 * commonly true:
 *
 *   1. THE FEED IS LIVE at the URL everyone quotes. Feed URLs rot quietly —
 *      a site moves to a new platform and the old path 301s to a homepage that
 *      returns HTTP 200 and no XML at all.
 *
 *   2. A SERVER IS ALLOWED TO FETCH IT. Plenty of sites answer a browser and
 *      403 anything else, or sit behind a CDN that challenges a datacentre IP.
 *      A feed that works from a laptop and fails from a Netlify function is the
 *      worst case, because it works in every test and never in production —
 *      which is `CLAUDE.md`'s "local green says nothing about a deployed
 *      artifact" pointed at somebody else's server.
 *
 *   3. THE SHAPE IS PARSEABLE without guessing. RSS and Atom are different
 *      formats with different element names, titles are usually but not always
 *      in CDATA, and the link is an element in one and an attribute in the
 *      other. Which parser this project needs — or whether it needs a
 *      dependency at all — is decided by what this prints.
 *
 * This probe does NOT parse properly. It counts and samples, deliberately, so
 * that the parser is written against what was seen rather than what was assumed.
 *
 *   node scripts/probe-news.js
 *
 * Costs nothing but politeness. One request per feed, and it sends a User-Agent
 * that says what it is — a request pretending to be a browser is a request
 * lying to somebody whose bandwidth it is using.
 */

const FEEDS = [
  ["Eurogamer", "https://www.eurogamer.net/feed"],
  ["Rock Paper Shotgun", "https://www.rockpapershotgun.com/feed"],
  ["PC Gamer", "https://www.pcgamer.com/rss/"],
  ["Polygon", "https://www.polygon.com/rss/index.xml"],
  ["GameSpot", "https://www.gamespot.com/feeds/news/"],
  ["IGN", "https://feeds.feedburner.com/ign/news"],
];

const UA = "Throughline/0.3 (ASE-26 coursework; feed reader; +https://github.com/Rotshes/Throughline)";

const count = (text, re) => (text.match(re) ?? []).length;

console.log("Fetching each feed once, with an honest User-Agent.\n");

const summary = [];

for (const [name, url] of FEEDS) {
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
      redirect: "follow",
    });
  } catch (e) {
    console.log(`${name}\n  UNREACHABLE  ${e.message}\n`);
    summary.push({ name, ok: false, why: e.message });
    continue;
  }

  const ms = Date.now() - started;
  const type = res.headers.get("content-type") ?? "(none)";
  const body = await res.text().catch(() => "");

  console.log(`${name}`);
  console.log(`  ${url}`);
  console.log(`  HTTP ${res.status}  ${ms}ms  ${body.length.toLocaleString("en-GB")} bytes`);
  console.log(`  content-type: ${type}`);
  if (res.url && res.url !== url) console.log(`  redirected to: ${res.url}`);

  if (!res.ok) {
    // A 403 here is the interesting failure: it means the site answers people
    // and refuses servers, and no amount of local testing would reveal it.
    console.log(`  -> refused. ${res.status === 403 ? "Answers browsers, not servers." : ""}\n`);
    summary.push({ name, ok: false, why: `HTTP ${res.status}` });
    continue;
  }

  const items = count(body, /<item[\s>]/gi);
  const entries = count(body, /<entry[\s>]/gi);
  const format = items > 0 ? "RSS" : entries > 0 ? "Atom" : "NEITHER";
  const cdata = count(body, /<!\[CDATA\[/g);

  console.log(`  format: ${format}   items: ${items}   entries: ${entries}   CDATA blocks: ${cdata}`);

  if (format === "NEITHER") {
    // HTTP 200 and no feed in it. The quiet failure this probe exists for.
    console.log(`  -> 200 OK and no feed. First 200 characters:`);
    console.log(`     ${body.slice(0, 200).replace(/\s+/g, " ")}\n`);
    summary.push({ name, ok: false, why: "200 but not a feed" });
    continue;
  }

  // One whole item, printed. A parser written from a field list rather than from
  // a real record is turn 005's mistake, and this project has made it twice.
  const block = format === "RSS"
    ? /<item[\s>][\s\S]*?<\/item>/i.exec(body)
    : /<entry[\s>][\s\S]*?<\/entry>/i.exec(body);

  if (block) {
    const tags = [...new Set(
      (block[0].match(/<([a-zA-Z0-9:_-]+)[\s>\/]/g) ?? [])
        .map(t => t.replace(/[<>\s\/]/g, ""))
    )];
    console.log(`  elements on one item: ${tags.join(", ")}`);
    console.log(`  the item itself, trimmed:\n`);
    console.log(block[0].slice(0, 900).split("\n").map(l => `    ${l}`).join("\n"));
  }
  console.log();
  summary.push({ name, ok: true, format, items: items || entries, cdata });
}

// --- what this decides --------------------------------------------------------

console.log("=".repeat(66));
console.log("\nsummary\n");
for (const s of summary) {
  console.log(
    `  ${s.name.padEnd(20)} ${s.ok ? `${s.format}, ${s.items} items` : `FAILED — ${s.why}`}`
  );
}

const usable = summary.filter(s => s.ok);
const formats = new Set(usable.map(s => s.format));
const anyCdata = usable.some(s => s.cdata > 0);

console.log(`
  ${usable.length} of ${FEEDS.length} feeds are usable from a server.
  formats in play: ${[...formats].join(" and ") || "none"}
  CDATA present:   ${anyCdata ? "yes" : "no"}

  WHAT THIS DECIDES

  Fewer than three usable feeds and the row is not worth a fourth service — one
  publisher's headlines is a link to one publisher, not a news row.

  Both RSS and Atom in play means two shapes to handle. One means one.

  CDATA present means a parser cannot simply strip tags: the text is inside a
  section that deliberately is not markup, and getting it wrong shows HTML
  fragments to the reader rather than a headline.

  None of the above is a reason to write a parser by hand OR to add a
  dependency. It is the evidence for choosing between them, which is a
  stop-and-ask either way.
`);
