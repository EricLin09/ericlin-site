---
title: "Pseudo-Positive Pair Selection"
date: 2026-10-16
description: "A research project on contrastive retrieval fine-tuning: 48 runs showing that a selector's apparent gain is partly just a smaller training set, that a calibrated cutoff can filter nothing at all, and that embedding geometry doesn't tell you which retriever is better."
tech: ["Python", "PyTorch", "BEIR", "conformal-prediction", "bootstrap"]
status: "completed"
---

If you want to fine-tune a retrieval encoder in a domain with no training labels, you can mine positive pairs out of the corpus itself: cluster the documents, pair each one with its nearest neighbour, train on that. Then you add a selector — keep only the pairs above some similarity cutoff — and the retrieval score goes up.

**What exactly did the selector earn?** Selection changes three things at once:

1. **which** pairs are trained on,
2. **how many** there are,
3. **how many optimiser updates** they receive (a smaller set means fewer steps per epoch).

Compare "selected" against "all candidates" and you get the sum of all three. This project is the evaluation design that separates them: every selector is matched against a **random subset of exactly its own size**, under **two explicit training budgets**, with the unchanged encoder kept as a reference throughout.

Supervised by Dr Xianzhi Wang · UTS 32933 Research Project · Spring 2026.

## Design

| | |
|---|---|
| Encoder | `all-MiniLM-L6-v2` — 22.7M parameters, 384-dim, 256-token limit |
| Datasets | **nfcorpus** (development setting) and **SciFact** (second-dataset robustness check), both from BEIR |
| Mining | MiniBatchKMeans into 25 clusters over the whole corpus; within each cluster, every document proposes its highest-cosine neighbour |
| Budgets | **1 epoch** (updates scale with set size) and **40 updates** (fixed, so every arm takes the same number of steps) |
| Scale | 48 fine-tuning runs across 3 paired seeds (13, 42, 1337) and 2 budgets, plus a zero-shot reference per dataset |
| Statistics | query-group bootstrap intervals, Holm-adjusted across the two planned primary contrasts per dataset |

Four arms select from the same cleaned pool:

| Arm | Rule |
|---|---|
| **All** | Keep every cleaned candidate. |
| **Threshold** | Keep candidates with cosine ≥ 0.8. |
| **Conformal** | Keep candidates scoring under a split-conformal cutoff at α = 0.2, calibrated on co-relevance proxies from *train* labels. |
| **Matched random** | Keep exactly as many uniformly-sampled pairs as the selector it controls, from that seed's pool. |

Pair cleaning works on content identity, not document IDs: each assembled text gets a SHA-256 digest, so identical-text self-pairs are dropped even when the IDs differ, and duplicate or reversed pairs are removed. Calibration and probe pairs are built from a fixed 80/20 partition of *train* queries and excluded from every candidate pool. Evaluation judgements never touch training.

![Retrieval of every trained arm against the unchanged encoder](/projects/pseudo-positive-selection/arm_retrieval.png)

## Finding 1: a matched control changes the conclusion, not just the error bar

The naive "threshold vs all candidates" difference splits exactly into two parts — what a same-size random subset already achieves, and what the selector adds on top of it.

![The naive threshold-minus-all difference split into a volume part and a selection part](/projects/pseudo-positive-selection/volume_decomposition.png)

| Dataset, budget | Threshold − all | Random − all | **Threshold − random** |
|---|---:|---:|---:|
| nfcorpus, 1 epoch | +0.01220 | +0.00508 | **+0.00712** [0.00294, 0.01156] |
| nfcorpus, 40 updates | +0.01095 | −0.00140 | **+0.01235** [0.00671, 0.01819] |
| SciFact, 1 epoch | +0.00962 | +0.00496 | **+0.00466** [−0.00007, 0.00971] |
| SciFact, 40 updates | −0.00621 | −0.00410 | **−0.00211** [−0.01291, 0.00851] |

Read the SciFact row. The naive one-epoch difference of **+0.00962** has interval [0.00097, 0.01833] — it excludes zero, and a study without the control would have reported a gain. The matched contrast is **+0.00466**, about half the size, and its interval includes zero. Same runs, same metric, opposite conclusion.

The error doesn't even point the same way each time. On nfcorpus under 40 updates the random subset falls slightly *below* all candidates, so the naive comparison **understates** the selection effect (0.01095 against 0.01235). Depending on dataset and budget, ignoring the control overstates, understates, or misattributes what selection did.

And the size of that error is itself budget-dependent: what a random subset gains over all candidates shifts by +0.00648 on nfcorpus and +0.00907 on SciFact between the two budgets. Equal-volume comparison isn't new — the E5 filtering ablation uses it — but holding the mined pool fixed across two budgets shows the naive error is not a constant you can mentally subtract.

Where the design does establish something: on nfcorpus, threshold beats its matched control under **both** budgets, with every seed-paired difference positive and both intervals above zero after Holm adjustment. On SciFact it doesn't — the one-epoch interval includes zero and the 40-update estimate changes sign. The honest summary is a benefit bounded to one dataset, not a selector that works.

## Finding 2: a calibrated cutoff can filter nothing at all

Split-conformal prediction gives a marginal coverage guarantee, which sounds like exactly the thing you want for "accept this pair or not". It isn't. The guarantee is about **retaining future genuine positives**; it says nothing about the proportion of *wrong* pairs among the ones you accept.

On nfcorpus, α = 0.2 produced a cutoff equivalent to cosine ≥ 0.18910 — which retained **every single candidate**: 2742, 2739 and 2732 of 2742, 2739 and 2732. Threshold, for comparison, kept 547, 526 and 546. The conformal arm performed no filtering whatsoever, and was therefore never trained on nfcorpus at all.

The reason is a construct mismatch, visible once you look at what the two pair types actually are. Calibration proxies are **documents judged relevant to the same query** — for nfcorpus query PLAIN-3062, that includes studies of amla, black raspberry and alcohol-related acetaldehyde exposure, which are not close paraphrases of each other. Candidates are **nearest neighbours inside a cluster**, which are. Calibrating a permissive cutoff on the loose relationship and applying it to the tight one admits everything.

SciFact shows the degeneracy isn't inevitable — its cutoff (cosine ≥ 0.53384) kept about 84% of candidates, enough to activate real matched controls. But dataset composition, candidate similarities and calibration size all differ at once (88 calibration pairs against nfcorpus's 2,000), and this design doesn't isolate which of them matters.

## Finding 3: embedding geometry doesn't rank retrievers

Alignment, uniformity, anisotropy and effective rank are the standard descriptors for what contrastive training does to a representation. Measured on the same completed runs as retrieval, they disagree with it.

![Anisotropy after training against retrieval quality](/projects/pseudo-positive-selection/geometry_retrieval.png)

- On nfcorpus, all-candidate tuning spreads embeddings hardest — anisotropy falls from 0.20744 to 0.04970, uniformity from −3.01405 to −3.63940 — and retrieves **worse than zero-shot**. Threshold spreads less (0.12237) and retrieves better.
- On SciFact, threshold's alignment distance *improves* between budgets (0.66548 → 0.63010) while its retrieval *falls* (0.64741 → 0.62863).

Both counterexamples hold in every individual seed, not just the means. These descriptors capture real changes; they do not give you a single ordering you can deploy on.

## Averages hide a lot of query-level churn

![nfcorpus per-query differences, sorted within each budget](/projects/pseudo-positive-selection/query_differences-light.png)

The nfcorpus mean gains sit on top of improved/tied/regressed counts of **103/152/69** after one epoch and **126/126/72** under 40 updates. The median difference is **zero** in both. The five largest improvements account for 24.6% and 15.9% of all positive difference; remove them and the means stay positive but shrink to 0.00403 and 0.00910.

Inspecting individual cases shows what the metric is actually responding to. For the one-word query *cilantro*, threshold puts five documents about **ciguatera** — a form of fish poisoning, lexically adjacent and semantically unrelated — at ranks 2 through 6. For the SciFact claim about arginine 90 in p150n, it surfaces documents on arginine metabolism and starvation at ranks 1 and 3 and drops the one structurally relevant paper from rank 1 to rank 4. Meanwhile the biggest "improvement" on SciFact query 183 is a single adjacent swap — one relevant document moving from rank 2 to rank 1 — which with one relevant document accounts for the *entire* 0.369 difference.

Judgement incompleteness cuts both ways: in the amla case, the control's top ten is full of unjudged cancer studies whose relevance the benchmark simply leaves open.

## What this is and isn't

The evidence is exploratory. Three trained seeds, two datasets, one encoder, a 19-pair SciFact geometry probe, and benchmark outcomes that were already known before the runs. The nfcorpus analysis uses development queries after historical results had been inspected; freezing SciFact's threshold, seeds and budgets before the new results limits adaptation but doesn't make it an untouched confirmatory benchmark.

What survives all of that is a procedure rather than a result:

- keep the **unchanged encoder** in every comparison — beating a matched control and improving on the original model are different questions, and only nfcorpus answers both;
- match every selector to a **random control of its own size**;
- record **actual optimiser updates**, not just epochs;
- read **query-level regressions** next to the average;
- check what a calibrated rule **actually retains** before trusting that it is selecting anything.

All 48 runs retain their saved per-query scores, model hashes and source records, so every reported number can be reconstructed.
