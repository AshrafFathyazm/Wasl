# e2e — responsive checks (`041`)

No SQL Server, no secrets, no seeded database: every `/api/**` request is answered by
`mockApi.mjs` through Playwright's `context.route`. The fixtures are deliberately awkward
(long Arabic and English subjects, a 90-character email, an unbroken 100-character token) —
a layout that survives them survives the seeded data.

```bash
npm run test:e2e      # smoke: core routes x 390/1280 x en/ar — exits 1 with every failure listed
npm run e2e:audit     # measure everything, write e2e/out/<label>/results.json + screenshots at 390 and 1024
MSYS_NO_PATHCONV=1 node e2e/shot.mjs /tickets 390 ar drawer   # one screenshot (Git Bash needs the env var, or it rewrites "/tickets")
```

The smoke test asserts overflow on the **document and on `<main>`**: the shell scrolls inside
`main`, so the document alone reported "no overflow" on a screen whose table was clipped.
It is not part of `vitest run` — it needs a browser (`npx playwright install chromium`).
