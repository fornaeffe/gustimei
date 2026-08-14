# Phase 1 deterministic benchmark

Run with:

```sh
npm run benchmark:phase1
```

The suite uses only seeded synthetic data. Whole tier groups are removed before training rankings
or pairwise observations are derived. Every category is generated, tuned, trained, and evaluated
independently.

## Dataset and acceptance rule

| Category   | Users | Places | Visited/user | Latent dimensions | Tie threshold | Noise | Validation users | Test users | Held-out pairs |
| ---------- | ----: | -----: | -----------: | ----------------: | ------------: | ----: | ---------------: | ---------: | -------------: |
| Restaurant |    48 |     32 |         4–16 |                 3 |          0.12 |  0.15 |               12 |         36 |             83 |
| Hotel      |    40 |     28 |         4–14 |                 2 |          0.15 |  0.18 |               10 |         30 |             75 |

The initial personalized candidate must beat the smoothed global prior on pairwise accuracy and
`tau-b`, maintain at least 80% supported-place coverage, and have positive NDCG/top-tier behavior.
Among candidates that pass, select by pairwise accuracy, then `tau-b`, then NDCG. Calibration,
novelty, cold-start slices, and top-tier retrieval are reported as diagnostic constraints rather
than hidden in the selection score.

The generalized Plackett–Luce grid independently varied factor dimension, regularization, epochs,
learning rate, tie propensity, and seed for each category. Both categories selected two dimensions,
35 epochs, learning rate 0.01, regularization 0.01, and tie propensity 0.5 from their respective
validation users. Category artifacts and user/place parameters remain separate.

## Restaurant test metrics

| Model                           | Pair accuracy |     tau-b |      NDCG | Top-tier recall |  Coverage | Novelty | Calibration error | Eligible accuracy |
| ------------------------------- | ------------: | --------: | --------: | --------------: | --------: | ------: | ----------------: | ----------------: |
| Generalized Plackett–Luce       |         0.482 |     0.144 |     0.853 |           0.500 |     1.000 |   0.378 |             0.040 |             0.536 |
| Bradley–Terry                   |         0.554 |     0.201 |     0.875 |           0.569 |     1.000 |   0.378 |             0.045 |             0.623 |
| **Nearest neighbor (selected)** |     **0.614** | **0.469** | **0.907** |       **0.694** | **1.000** |   0.378 |             0.226 |         **0.681** |
| Smoothed global                 |         0.337 |     0.020 |     0.831 |           0.444 |     1.000 |   0.378 |             0.019 |             0.362 |
| Seeded random                   |         0.398 |    -0.025 |     0.819 |           0.431 |     0.000 |   1.000 |             0.062 |             0.000 |

## Hotel test metrics

| Model                        | Pair accuracy |     tau-b |      NDCG | Top-tier recall |  Coverage | Novelty | Calibration error | Eligible accuracy |
| ---------------------------- | ------------: | --------: | --------: | --------------: | --------: | ------: | ----------------: | ----------------: |
| Generalized Plackett–Luce    |         0.507 |     0.413 | **0.931** |       **0.750** |     1.000 |   0.404 |             0.080 |             0.455 |
| **Bradley–Terry (selected)** |     **0.547** | **0.452** |     0.928 |           0.733 | **1.000** |   0.404 |         **0.091** |             0.509 |
| Nearest neighbor             |         0.520 |     0.405 |     0.914 |           0.683 |     1.000 |   0.404 |             0.158 |         **0.545** |
| Smoothed global              |         0.453 |     0.290 |     0.896 |           0.633 |     1.000 |   0.404 |             0.155 |             0.382 |
| Seeded random                |         0.373 |     0.084 |     0.843 |           0.483 |     0.000 |   1.000 |             0.111 |             0.000 |

The 5 ranked-place / 3 resolved-tier / 4 supported-factor gate improved the selected model's
eligible pairwise accuracy over the global prior for both categories, so it remains the Phase 1
serving hypothesis. Cold-start results are sparse and unstable; below-gate results must use the
clearly labelled global/community fallback.

## Interpretation limits

These metrics are reproducible implementation-selection evidence only. Dataset size, simulated
noise, and held-out visited places do not represent real Italian catalogue coverage or real user
behavior. Phase 7 internal diagnostics and Phase 9 private-beta evaluation remain separate gates.
