# REST API

A small, read-only JSON API over the Bharat Lens corpus. The web pages
server-render from the same data layer for speed and SEO; these endpoints expose
that data as a documented contract, and are what the insights dashboard consumes
from the browser.

Base URL (local): `http://localhost:3000`

## Conventions

Every response uses one of two envelopes:

```jsonc
// success
{ "data": <payload>, "meta": { ... } }   // meta present on lists

// failure
{ "error": { "code": "invalid_request", "message": "...", "details": ... } }
```

Status codes are meaningful, decided in one place (`src/lib/api/http.ts`):

| Status | When |
| --- | --- |
| `200` | OK |
| `400 invalid_request` | a query parameter failed validation (details lists the issues) |
| `404 not_found` | the requested article does not exist |
| `503 service_unavailable` | the database is unreachable (retryable) |
| `500 internal_error` | anything unexpected |

Validation is schema-based (Zod, `src/lib/api/params.ts`); scope and category
enums are built from the taxonomy config, so the API can never accept a value
the app doesn't define.

## Endpoints

### `GET /api/articles`

A paginated, filtered list of clustered stories.

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `scope` | enum | `india` | `india`, `india-abroad`, `impact-on-india`, `world` |
| `category` | enum | — | one of the 11 categories; omit for all |
| `sort` | enum | `newest` | `newest`, `trending`, `popular`, `oldest` |
| `range` | enum | `1d` | `live`, `1d`, `week`, `month`, `past-month`, `year` |
| `page` | int | `1` | 1–100 |

```bash
curl "http://localhost:3000/api/articles?scope=india&category=sports&range=week"
```

```jsonc
{
  "data": [
    {
      "id": "…", "title": "…", "url": "https://…",
      "source": { "id": "the-hindu", "name": "The Hindu" },
      "byline": "…", "category": "sports", "contentType": "news-report",
      "publishedAt": "2026-10-01T…Z", "discoveredAt": "2026-10-02T…Z",
      "isNew": true, "summary": null, "grounded": false,
      "alsoReportedBy": [{ "source": "PTI", "url": "https://…" }]
    }
  ],
  "meta": { "page": 1, "pageSize": 40, "hasMore": true,
            "filters": { "scope": "india", "category": "sports", "sort": "newest", "range": "week" } }
}
```

### `GET /api/articles/:id`

One article, with full text when the source permits republication
(`fullText` is otherwise `null`). Returns `404` if the id is unknown.

```bash
curl "http://localhost:3000/api/articles/<uuid>"
```

### `GET /api/search?q=...`

Full-text search across every source and date. `q` must be at least 2
characters (`400` otherwise).

```bash
curl "http://localhost:3000/api/search?q=monsoon"
```

### `GET /api/stats`

Corpus and data-quality summary. `dupSourceClusters` is the clustering
invariant — an outlet may appear in a cluster at most once, so this must be `0`.

```bash
curl "http://localhost:3000/api/stats"
```

```jsonc
{ "data": {
  "totalArticles": 5146, "totalStories": 4340, "multiOutletStories": 574,
  "activeSources": 33, "groundedRate": 0.0, "dupSourceClusters": 0,
  "byScope": [{ "scope": "india", "count": 3888 }, …],
  "byCategory": [{ "category": "general", "count": 2473 }, …]
} }
```

### `GET /api/sources`

Per-source ingestion health: how each feed was discovered, when it was last
scanned, and how many articles it has yielded.

```bash
curl "http://localhost:3000/api/sources"
```

### `GET /api/health`

Liveness probe. `200` when the database answers, `503` when it cannot be
reached.

```bash
curl -i "http://localhost:3000/api/health"
```

## Tests

`npm run test:api` covers the validation schemas and the serializer (bad input
rejected, defaults applied, no internal fields leaked, dates as ISO strings).
