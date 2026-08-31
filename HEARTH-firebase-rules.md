# Hearth — Firebase security rules: what is already done, and what is left

**Written 31/08/2026**, after v449 (the medical history section) merged and Cathal asked how to
finish Cloudflare step 7.

**Read this before proposing any Firebase security work.** The state of the rules is recorded in
`HEARTH-archive.md` under **v291** — a file `CLAUDE.md` explicitly tells sessions *not* to read
unless an old version is referenced. This session very nearly recommended fixing something that was
closed months ago. That is the main reason this file exists.

---

## 1. What is ALREADY in place — do not re-chase this

From the v291 entry, closed by Cathal himself with no code change:

> Cathal verified the Firebase rules (`/hearth` read+write require `auth != null`, all else denied)
> and **disabled account sign-up** in Firebase Auth — the two existing accounts are now the only ones
> that can ever exist.

So, as of v291 and still true unless someone changed it in the console since:

- **The database is NOT in test mode.** An unauthenticated request to any path under `/hearth` is
  denied. Someone who somehow learned the database URL gets nothing without an account.
- **Nobody can create an account.** Sign-up is off. The two family accounts are the whole population.
- **Everything outside `/hearth` is denied outright.**

Two consequences worth stating, because they are load-bearing elsewhere:

1. **Every device is necessarily on Firebase Auth mode already.** The app's legacy login writes a
   password hash to `/hearth/users/<name>/auth.json` with **no token at all** (`doLogin`, the
   `!hearthApiKey` branch). Under rules that require `auth != null` that write is denied, so legacy
   mode cannot work — and sync does work, therefore both phones hold an API key and a refresh token.
   The app's own error string for this case is *"Database rules are locked. Please set your Web API
   Key first, or temporarily open your Firebase rules."*
2. **The medical history added in v449 is not sitting on an open database.** Cathal's condition on
   the v449 privacy decision ("finish Cloudflare step 7 first") is about the ungated *website*, which
   is a genuinely different door — see §4.

---

## 2. The one real gap that remains

The current rule is `auth != null` for the whole of `/hearth`. That authenticates, but it does not
**scope**: with a valid token, either account can read the other's entire tree.

That includes **`/hearth/users/<name>/backups/`**, and a Hearth cloud backup is a full copy of
everything — lists, recipes, baby records, and since v449 the complete medical history.

Between two family members who have deliberately chosen household-shared medical records, that is
not a privacy problem. It is a **blast-radius** problem: if either account's password leaked, the
attacker currently gets *both* people's everything, including every stored backup, rather than one
account's.

This is **hardening, not a hole.** It was not urgent before v449 and it is not an emergency now.

**DECIDED 31/08/2026 — deferred, not pending.** Cathal's call: leave this recorded and do Cloudflare
step 7 (§ 4) first. So this section is **not an open question waiting on an answer** — do not re-ask
it, and do not apply it uninvited. It is here so that if it is ever wanted, nobody has to re-derive
the rules, the test plan or the reason households are left alone. Raise it again only if Cathal
does, or if something changes the picture — a third account, a device that cannot sign in, or a
password known to have leaked.

### The proposed replacement

```json
{
  "rules": {
    ".read": false,
    ".write": false,

    "hearth": {
      "users": {
        "$user": {
          ".read":  "auth != null && auth.token.email === $user.toLowerCase() + '@hearth.app'",
          ".write": "auth != null && auth.token.email === $user.toLowerCase() + '@hearth.app'"
        }
      },

      "households": {
        "$code": {
          ".read": "auth != null",

          "shared": {
            ".write": "auth != null"
          },

          "members": {
            "$member": {
              ".write": "auth != null && $member.toLowerCase() === auth.token.email.replace('@hearth.app', '')"
            }
          }
        }
      }
    }
  }
}
```

**Why each part is shaped that way:**

- **`/hearth/users/$user` scoped to its owner.** The app's identity is `<username>@hearth.app`
  (`doLogin` builds it), so the email *is* the username. This is the only substantive change from
  what is live today.
- **`.toLowerCase()` on `$user` is not decoration.** Firebase normalises emails to lower case. A
  username stored with a capital (`Cathal`) would never equal `cathal@hearth.app`, and that account
  would be locked out of its own data and backups. Harmless if both names are already lower case.
- **Households stay `auth != null`.** Deliberately *not* tightened to members-only — see §5.
- **`members/$member` lets an authenticated user add only themselves.** Required, or nobody could
  ever join a household: joining means writing your own name into a household you are not yet in.
- **`.read`/`.write: false` at the root** matches the existing "all else denied" and makes anything
  added later denied by default.

---

## 3. How to apply it without locking the family out

**Step A — copy the current rules into a note.** Firebase console → Realtime Database → Rules. That
copy is the entire rollback plan.

**Step B — paste the block from §2 and publish.**

**Step C — prove it in the Rules Playground before trusting it.** The Playground simulates a request
without touching data. Run all six:

| # | Location | Auth | Expected |
|---|---|---|---|
| 1 | `/hearth/users/<your name>/data` | Unauthenticated | DENIED |
| 2 | `/hearth/users/<your name>/backups` | Unauthenticated | DENIED |
| 3 | `/hearth/households/<your code>/shared` | Unauthenticated | DENIED |
| 4 | `/hearth/users/<your name>/data` | as **you** | ALLOWED |
| 5 | `/hearth/users/<the other person>/backups` | as **you** | **DENIED** ← the whole point |
| 6 | `/hearth/households/<your code>/shared` | as **you** | ALLOWED |

**Test 5 is the one that proves the change did anything.** Under today's live rules it comes back
ALLOWED; under the new ones it must be DENIED. If it is still ALLOWED after publishing, the rules did
not save.

**Step D — check both phones.** Settings → **📡 Sync health** should show a recent successful push
and pull. Then tick something on one phone and watch it reach the other, and once in the reverse
direction.

**If sync breaks:** read §5's warning about silent failure first, then paste the Step A rules back.

---

## 4. Cloudflare step 7 — DONE 31/08/2026

**Done on 31/08/2026.** The family's phones are on the Pages URL and GitHub Pages is switched off,
so `coshea321.github.io` no longer serves Hearth and the Cloudflare Access gate is now the only way
in. The repo stayed public, so every `raw.githack` PR test link still works. **This section is kept
as the record of how it was done** — the steps and traps below are what to repeat if the site ever
moves again.

Step 7 was two things, and neither was "make the repo private" — that is a **decision on record
against** (`HEARTH-backlog.md`): githack serves public repos only, so every "👉 Try this version"
link in every PR would break, and those are how Cathal reviews.

1. **Repoint the family's phones** to `https://miniature-journey-b9p.pages.dev`, through the
   Cloudflare PIN, then Add to Home Screen and delete the old icon.
2. **Turn GitHub Pages off**: repo → **Settings → Pages**, then in the **Branch** dropdown (the one
   showing `main`) choose **None** and press **Save**. The repo stays public.

   **The `None` is in the BRANCH dropdown, not the Source one** — Source only offers *Deploy from a
   branch* and *GitHub Actions*, and there is no way to disable Pages from it. This write-up said
   "Source: None" first time round and Cathal hit the dead end on 31/08/2026. Leave Custom domain,
   Enforce HTTPS and the Enterprise "Visibility" upsell alone; none of them matter once Pages is off.

   Verify with the URL in a **private window or on mobile data, on a device that has never opened
   it** — it should 404. Your own phone keeps serving the old app from the service-worker cache and
   will look exactly like nothing happened (see the first trap below). Unpublishing is not always
   instant; give it a couple of minutes.

In that order — Pages off first would strand the family until the new app was set up.

**Three traps, all already recorded in the backlog and worth repeating here:**

- **The service worker will lie to you.** Hearth serves its shell cache-first, so a phone that has
  already opened `coshea321.github.io` keeps loading from cache with no network request, even after
  Pages is off. "It still works on my phone" is not evidence. Test on a device that has never opened
  the URL.
- **Storage is per-origin.** The new hostname starts with an empty Hearth. The data returns from
  Firebase once the database URL, API key, login and household code are re-entered. **Export a backup
  from the old origin first.**
- **Do not remove `coshea321.github.io` from `_prodHosts`.** It looks like tidy-up. Any phone still
  on that origin would then treat the app as a *test build* and `wipeTestStore()` would clear its
  entire `fl4_*` store on next load. Leave the entry; it is inert once Pages is off.

---

## 5. The trap: the app fails quietly, not loudly

`authUrl()` is written like this:

```js
function authUrl(url) {
  if (!hearthIdToken) return url;      // <-- sends the request UNAUTHENTICATED
  ...
}
```

With no token in hand the app does not stop and does not warn — it sends the request without one.
Against rules that require auth, that request is denied and **sync simply stops**, with no error
surfaced to the user.

`hearthIdToken` is a plain variable, **not restored from storage**, so it is empty on every cold
start. `getAuthToken()` repopulates it by trading the stored `hearth_refresh_token`, and
`onLoginSuccess()` deliberately sequences the first sync behind that refresh (the v373 change) — so a
normal launch is fine.

The failure case is a device with **no stored refresh token**. `getAuthToken()` calls back `null`,
sync starts anyway, every request goes out unauthenticated, and the device looks completely normal
while silently syncing nothing.

**This matters most for a NEW device** — including every phone re-set-up during Cloudflare step 7.
The fix is the same in all cases: **log out and log back in**, which stores a fresh refresh token.

**If sync breaks, in order:**
1. Settings → 📡 Sync health on the affected phone. An old "last successful push/pull" is this.
2. Log out and back in on that phone.
3. Still broken → restore the Step A rules and re-read §1.

---

## 6. Deliberately NOT done

1. **Households are not tightened to members-only.** The strict rule would be:

   ```json
   ".read": "auth != null && data.child('members').child(auth.token.email.replace('@hearth.app','')).val() === true"
   ```

   **Do not paste that yet.** The join flow writes `members/<you>` with a fire-and-forget
   `fetch(...).catch(...)` and calls `fetchHousehold()` immediately without awaiting it, so the read
   can beat the membership write and joining would fail intermittently. It needs a small code change
   first — await the members PUT before `fetchHousehold()`. With sign-up disabled and only two
   accounts in existence, the practical gain today is nil anyway.

2. **Nothing here has been applied or measured.** Every claim about the app's behaviour is read from
   the v449 source and is accurate to it. Every claim about the *live* rules comes from the v291
   archive entry — Cathal's own verification, not a measurement made now. The Rules Playground in
   §3 Step C is where it stops being on trust.

3. **Sign-up stays disabled.** It already is. If a new device ever needs an account, it has to be
   re-enabled for a minute and turned off again.
