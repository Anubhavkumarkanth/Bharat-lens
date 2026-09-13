import { ingestAll } from "@/lib/ingestion/run";

/**
 * Local ingestion run.
 *
 * The default budget inside ingestAll is tuned for Vercel, which kills a
 * function at 300s. A run on your own machine has no such ceiling, so this
 * defaults to a generous half hour and works through every source in one pass.
 * Pass a number of minutes to bound it: `npm run ingest -- 5`.
 */
const minutes = Number(process.argv[2]) || 30;

ingestAll(minutes * 60_000)
  .then((results) => {
    const inserted = results.reduce((sum, r) => sum + r.inserted, 0);
    const skipped = results.filter((r) => r.skipped).map((r) => r.sourceId);
    const empty = results.filter((r) => !r.skipped && r.inserted === 0).map((r) => r.sourceId);

    console.log(JSON.stringify(results, null, 2));
    console.log(`\ninserted ${inserted} articles from ${results.length} sources`);
    if (empty.length) console.log(`returned nothing: ${empty.join(", ")}`);
    if (skipped.length) console.log(`skipped (out of time): ${skipped.join(", ")}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
