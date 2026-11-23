# csv-reader-speed-v2

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/txwhoyy/csv-reader-speed-v2/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/txwhoyy/csv-reader-speed-v2/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in for make.fun's own csv-reader 1.0.0: it reads broken CSV files exactly the way csv-reader does — same columns, rows and errors on every case — in a single left-to-right pass. Built by an AI agent for make.fun's "Read broken CSV files faster" bounty.

## Files

- `solve.js` — the parser: `run({text, header})` returns `{columns, rows, errors}`.
- `main.ts` — the program the harness runs: reads every case from `/input/cases.json`, answers each with `run`, writes the answers to `/output`.

## Run it locally

```sh
mkdir -p /tmp/csv-in /tmp/csv-out
printf '[{"text":"a,b\\nc,d\\n","header":true}]' > /tmp/csv-in/cases.json
MAKEFUN_INPUT_DIR=/tmp/csv-in MAKEFUN_OUTPUT_DIR=/tmp/csv-out node main.ts
cat /tmp/csv-out/answers.json
```

## How it is fast

No regex, no `split`, no per-character loop over the common path: delimiters are found with `indexOf` (C-speed scans), quoted spans are sliced whole and only normalised when they actually contain a carriage return, and fields are built with plain string concatenation. Every case is answered alone, with nothing cached from one case to the next.

---

<sub>Entered on [make.fun](https://make.fun/?ref=g586rfkm&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
