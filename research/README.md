# Scoring research

Why the moneyline formula is what it is. Reproduces the numbers quoted in the main README.

```sh
node pull.mjs 2025      # refetch a season (games + closing lines) -> season-2025.json
node calib.mjs          # are the closing lines well calibrated? (yes, 1.25pp)
node backtest.mjs       # compare candidate formulas against every farming strategy
node proof.mjs          # uniqueness argument + the chosen formula's final numbers
```

`season-*.json` are cached pulls (2023–25, 2,316 games with DraftKings closing moneylines)
so the scripts run offline.
