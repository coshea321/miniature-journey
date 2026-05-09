# My Health PWA

A personal health & fitness progressive web app combining:
- 🛒 Grocery / shopping lists
- ✅ To-do lists
- 🧘 Guided yoga flows (Full Body Flow + Hips & Lower Back)
- 🌿 Physio programmes (Nerve & Hip + Lower Limb)
- 💪 Bodyweight workouts (Push / Pull days)
- ⚖️ Bodyweight log
- 🏠 Today dashboard

## Installing on iPhone

1. Open the site in **Safari** (must be Safari for PWA install)
2. Tap the **Share** button (box with arrow at bottom of screen)
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **Add** — the app icon will appear on your home screen

## Installing on Android

1. Open the site in **Chrome**
2. Tap the **three-dot menu** (top right)
3. Tap **"Add to Home screen"** or **"Install app"**
4. Tap **Install**

## Updating the app

After pushing changes to GitHub, the service worker may serve the cached old version for one session.
To force an immediate update on your phone:

- **iPhone Safari:** go to Settings → Safari → Clear History and Website Data, then reopen
- Or increment `CACHE` in `sw.js` (e.g. `myhealth-v2`) before pushing — this forces a fresh cache on next load

## Hosting

This app is hosted via [GitHub Pages](https://pages.github.com/).
All data is stored locally in the browser's `localStorage` — nothing is sent to any server.
