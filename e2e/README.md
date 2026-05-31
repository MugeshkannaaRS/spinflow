# Playwright E2E tests for MillFlow (SpinFlow)

Setup:

1. Change to the `e2e` folder and install dependencies:

```bash
cd e2e
npm install
npx playwright install
```

2. Run tests (headless):

```bash
npm test
```

3. Run headed (interactive) mode:

```bash
npm run test:headed
```

Notes:
- Tests include example flows (authentication). Selectors may need adjustment to match the live app.
- Add additional specs under `e2e/tests/` for modules listed in your audit.
- After running, open the HTML report with `npm run test:report`.
