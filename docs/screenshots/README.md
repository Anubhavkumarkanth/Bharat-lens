# Screenshots

`feed.png`, `hindi.png`, `search.png`, `reader.png` and `insights.png` are retaken by
the Analysis report GitHub Action (`.github/scripts/screenshots.mjs`) against
production, at 1440px wide. Don't replace them with ones from a local or test
database.

To take them yourself against a running server:

```bash
npm install --no-save playwright
BASE_URL=http://localhost:3000 node .github/scripts/screenshots.mjs
```

`saved.png` would still need doing by hand, since it needs some saved stories, a
collection and a note first.
