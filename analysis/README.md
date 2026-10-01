# Coverage analysis

Once the app had a few weeks of articles in it I got curious about the data itself. Which
outlet actually gets a story out first? How much of what Indian papers run is also on a
wire? Do outlets have a beat, or does everyone cover the same mix?

This folder is where I try to answer that. It's SQL, pandas and some basic stats.

## Questions

1. How much of the data is usable for each question? (Mostly: are the publish times any good?)
2. Who publishes a shared story first, and how far behind is everyone else?
3. Do Indian newspapers trail the wires in a way that's measurable?
4. Which outlets cover the same stories?
5. Does each outlet have a beat?
6. When does news get published, and how many outlets carry a typical story?

The `/insights` page in the app shows the same numbers live.

## Layout

- `../drizzle/manual/0002_analytics_views.sql`: the cleaning rules, as three SQL views.
  Both the app and this folder read from them, so a definition only has to change in one
  place.
- `coverage_analysis.py`: loading data and all the analysis functions.
- `charts.py`: matplotlib charts, one per question.
- `report.py`: runs everything, writes `output/FINDINGS.md`, charts and CSVs.
- `bharat_lens_coverage.ipynb`: the same analysis as a notebook, with notes.
- `test_coverage_analysis.py`: tests on small made-up inputs.

## Methods

| Question | What I used | Why |
| --- | --- | --- |
| Usable publish times | Rules in SQL (missing, date-only, future, stale) | Publishers set their own timestamps and some are clearly wrong. I'd rather drop them than guess. |
| Who's first | First-rate on stories 2+ outlets covered, Wilson 95% interval | If only one outlet ran a story, it was never in a race. Wilson behaves at small samples. |
| How far behind | Median delay, bootstrap CI | Delays are very skewed, so I didn't want to assume a normal distribution. |
| Wires vs papers | Exact binomial test on stories both carried | If neither side were faster, who's first would be a coin flip. |
| Overlap | Jaccard similarity + hierarchical clustering | Doesn't favour big outlets, and the clustering groups similar ones together. |
| Beats | Chi-square, Cramér's V, location quotient | With this many rows everything comes out significant, so V (effect size) matters more. LQ shows which categories. |
| Timing | Weekday × hour, in IST | UTC hours don't mean much for Indian papers. |

Anything with fewer than 10 stories behind it gets left out.

## Running it

```bash
pip install -r analysis/requirements.txt

pytest analysis                                  # no database needed
python analysis/report.py --install-views        # first run: creates the views
python analysis/report.py --days 90              # later runs, any window

pip install jupyterlab
jupyter lab analysis/bharat_lens_coverage.ipynb
```

It reads `DATABASE_URL` from the environment or from `.env.local`.

## GitHub Action

`.github/workflows/analysis-report.yml` does all of the above against the production
database every Monday and commits `output/`, the run notebook, and
the README screenshots. You can also start it by hand from the Actions tab.

It needs a `DATABASE_URL` repo secret. For Supabase, use the pooler URL
(`*.pooler.supabase.com`). GitHub's runners don't have IPv6 and the direct host does.

## Caveats

- Publish times come from the publishers. If one rounds or backdates its timestamps, its
  speed numbers are off and I have no way to tell.
- A "story" is a group of similar headlines from different outlets within 48 hours. That
  can merge two different events or split one. Two outlets sharing a story means they
  covered the same thing, not that one copied the other.
- Feeds only show part of what each outlet publishes, and sources sometimes go quiet for
  weeks (PTI did).
- This shows what happens, not why.
- Only titles, timestamps and labels are used. Article text never leaves the database.
