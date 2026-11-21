# Admin guide tools

Scripts that build `docs/Brid_Town_Website_Admin_Guide.docx` and the screenshots it uses.

- `build-guide-v2.cjs` builds the guide (v2.0, the simplified admin). It needs the `docx` npm package,
  which is not a project dependency: run it from a scratch folder with `npm install docx`.
  `SHOTS_DIR=<folder> node build-guide-v2.cjs <output.docx>`. Missing screenshots are skipped and listed.
  v2.0 is drafted but **not yet published to docs/**: it waits for new screenshots.
- `build-guide-v1.cjs` built the published v1.1 (kept for reference).
- Admin screenshots: `npm run cms:admin -- --otp=123456 guide-shots` (see `cms/scripts/guide-screenshots.mjs`;
  images go to `%TEMP%\bridtown-guide-shots`, or `SHOTS_DIR`).
- `site-screenshots.mjs <outdir> <path> …` takes desktop and mobile screenshots of the local preview
  and reports page-wide horizontal overflow. In Git Bash prefix it with `MSYS_NO_PATHCONV=1`.
