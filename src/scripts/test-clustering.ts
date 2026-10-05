import { chooseCluster, titleTokens, type ClusterCandidate } from "@/lib/ranking/similarity";

/**
 * Clustering decision tests. The headline case is the bug that shipped twice:
 * an outlet's re-filing of a story must not join a cluster that outlet already
 * occupies, including a cluster it JOINED rather than created.
 */
const cases: { desc: string; got: unknown; want: unknown }[] = [];
function check(desc: string, got: unknown, want: unknown) {
  cases.push({ desc, got, want });
}

const C = (scope: string, sourceId: string, title: string, clusterId: string): ClusterCandidate => ({
  scope,
  sourceId,
  tokens: titleTokens(title),
  clusterId,
});
const article = (scope: string, sourceId: string, title: string) => ({
  scope,
  sourceId,
  tokens: titleTokens(title),
});

// Same story, different outlets → join the one cluster.
{
  const candidates = [C("world", "reuters", "Spanish PM Sanchez calls snap election for November", "c1")];
  check(
    "a different outlet's matching story joins the cluster",
    chooseCluster(candidates, article("world", "the-print", "Spanish PM Sanchez calls snap election")),
    "c1"
  );
}

// The bug: once an outlet is in a cluster, its re-filing must NOT join it,
// even when the outlet JOINED that cluster rather than creating it.
{
  // reuters created c1; the-print then joined c1 (the join path).
  const candidates = [
    C("world", "reuters", "Spanish PM Sanchez calls snap election for November", "c1"),
    C("world", "the-print", "Spanish PM Sanchez calls snap election", "c1"),
  ];
  check(
    "an outlet's re-filing is kept out of a cluster it already joined",
    chooseCluster(candidates, article("world", "the-print", "Spanish PM Sanchez calls snap election Nov 29")),
    null
  );
}

// Unrelated story → no cluster.
{
  const candidates = [C("india", "pti", "Monsoon rains lash Mumbai as IMD issues red alert", "c1")];
  check(
    "an unrelated headline starts a new cluster",
    chooseCluster(candidates, article("india", "the-hindu", "Stock markets rally on strong earnings")),
    null
  );
}

// Same story but different scope → not merged (scopes are independent).
{
  const candidates = [C("world", "bbc", "India and US sign trade agreement on tariffs", "c1")];
  check(
    "a matching headline in another scope does not merge",
    chooseCluster(candidates, article("impact-on-india", "reuters", "India and US sign trade agreement on tariffs")),
    null
  );
}

// First article of its kind → new cluster (no candidates).
check("the first article starts a new cluster", chooseCluster([], article("india", "pti", "Budget 2026 tabled in Parliament")), null);

let passed = 0;
for (const c of cases) {
  const ok = c.got === c.want;
  if (ok) passed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.desc}`);
  if (!ok) console.log(`      got=${String(c.got)} want=${String(c.want)}`);
}
console.log(`\n${passed}/${cases.length} passed`);
process.exit(passed === cases.length ? 0 : 1);
