# Screenshots

`feed.png`, `reader.png` and `search.png` are captured headlessly at 1440px wide:

```bash
chrome --headless=new --hide-scrollbars --window-size=1440,1100 \
  --screenshot=docs/screenshots/feed.png http://localhost:3000/india
```

`hindi.png` uses the URL override rather than the toggle, since a headless run
has no cookie to toggle:

```bash
chrome --headless=new --hide-scrollbars --window-size=1440,1100   --screenshot=docs/screenshots/hindi.png "http://localhost:3000/india?lang=hi"
```

Still worth adding by hand, because it needs state a headless run cannot reach:

- `saved.png` — the Saved page with a collection, a note and a date filled in.
  Save a couple of stories in a real browser first, then screenshot /saved.

Take that one with the window maximised and crop out browser chrome.
