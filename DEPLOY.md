# Get Godzilla Smash onto an iPad (or any phone/tablet)

> **✅ Live now:** https://egodogg.github.io/godzilla-smash/
> On the iPad, open that in **Safari → Share → Add to Home Screen**. Repo: `EgoDogg/godzilla-smash`.

It's a **PWA** (installable web app) — no App Store needed. Host the files at an HTTPS
URL, open it in Safari on the iPad, and **Add to Home Screen**. You get a real icon,
fullscreen launch, and it works offline after the first load.

**Files that make up the app** (the rest of the folder is dev stuff and can be ignored):
`index.html` · `game.js` · `manifest.json` · `sw.js` · `icon-512.png` · `icon-192.png`

---

## Option A — Netlify Drop (fastest, ~2 min, no account needed to test)

1. Go to **https://app.netlify.com/drop**
2. Drag the **`godzilla-smash` folder** onto the page (extra files don't hurt).
3. It gives you a live HTTPS URL like `https://random-name.netlify.app`.
   (Sign in with GitHub/email if you want to keep the URL or rename it.)

## Option B — GitHub Pages (free, permanent, you already have GitHub)

1. Create a repo (e.g. `godzilla-smash`) and push these files to it.
2. Repo **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `root`**.
3. Wait ~1 min; your URL is `https://<user>.github.io/godzilla-smash/`.
   (All paths in the app are relative, so the subfolder URL works fine.)

---

## Add it to the iPad Home Screen

1. Open the URL in **Safari** on the iPad (must be Safari, not Chrome, for install).
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Launch it from the new **Godzilla Smash** icon — it opens fullscreen, no browser bars.

**Notes**
- **Landscape** looks best (Godzilla on the left, full skyline to the right).
- **Offline:** after the first load the service worker caches everything, so it plays
  with no connection.
- **Updating later:** if you change the game, bump `CACHE = 'godzilla-v1'` in `sw.js`
  (e.g. `-v2`) so devices pull the new version, then re-deploy.

## Want a real native app instead?
Wrap `index.html` in a WKWebView Xcode project and build to the iPad with your Apple
Developer account — that's the path to TestFlight / the App Store.
