# Screenshots

`feed.png`, `reader.png` and `search.png` are captured headlessly at 1440px wide:

```bash
chrome --headless=new --hide-scrollbars --window-size=1440,1100 \
  --screenshot=docs/screenshots/feed.png http://localhost:3000/india
```

Worth adding by hand, because they need state a headless run does not have:

- `saved.png` — the Saved page with a collection, a note and a date filled in
- `hindi.png` — any feed with the language set to हिं, which shows the bilingual work

Take those with the window maximised and crop out browser chrome.
