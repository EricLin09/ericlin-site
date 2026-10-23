---
title: "Half That Gain Was Just a Smaller Dataset"
date: 2026-10-16
description: "Filtering your training pairs improves retrieval — but a random subset of the same size improves it too. Across 48 runs, leaving out that control overstated one result, understated another, and flipped a third from significant to not."
tags: ["retrieval", "experiment-design", "evaluation"]
---

Here is a shape of experiment that shows up constantly in representation learning. You mine training pairs cheaply, you add a rule that keeps only the good ones, you fine-tune on what survives, and the benchmark score goes up. You report the gain and attribute it to the rule.

The problem is that the rule did not do one thing. It did three:

1. it changed **which** pairs you train on,
2. it changed **how many** there are,
3. and — because a smaller set means fewer batches per epoch — it changed **how many optimiser updates** they get.

Comparing "selected" against "all candidates" measures the sum. My [research project](/projects/pseudo-positive-selection) was mostly an attempt to take that sum apart.

## The control

For every selector, train an extra arm on a **uniformly random subset of exactly the same size**, from the same pool, with the same seed. Then run the whole thing under two training budgets: one epoch (updates scale with set size) and a fixed 40 updates (every arm takes the same number of steps).

That gives an exact decomposition. The naive difference is the sum of two measurable pieces:

> (threshold − all) = (random subset of that size − all) + (threshold − that random subset)

Only the second piece is selection. 48 fine-tuning runs later, across nfcorpus and SciFact with three paired seeds:

| Dataset, budget | Naive: threshold − all | Volume: random − all | **Selection: threshold − random** |
|---|---:|---:|---|
| nfcorpus, 1 epoch | +0.01220 | +0.00508 | **+0.00712** [0.00294, 0.01156] |
| nfcorpus, 40 updates | +0.01095 | −0.00140 | **+0.01235** [0.00671, 0.01819] |
| SciFact, 1 epoch | +0.00962 | +0.00496 | **+0.00466** [−0.00007, 0.00971] |
| SciFact, 40 updates | −0.00621 | −0.00410 | **−0.00211** [−0.01291, 0.00851] |

*(nDCG@10, means over seeds 13/42/1337, 95% query-group intervals.)*

## It changes the conclusion, not the error bar

Look at SciFact after one epoch. The naive difference is **+0.00962**, with interval [0.00097, 0.01833] — it excludes zero. Analysed exactly the same way, this would have been written up as a gain from selection.

The matched contrast is **+0.00466**, about half as large, interval [−0.00007, 0.00971]. Includes zero. Same runs, same metric, same bootstrap procedure, opposite conclusion. Roughly half of what looked like a selector was a smaller training set.

What stopped me from filing this under "naive comparisons inflate things" is the nfcorpus 40-update row. There the random subset lands slightly *below* all candidates, so the naive comparison **understates** selection: 0.01095 against a true 0.01235. The bias is not a constant you can keep in your head and subtract.

It isn't even stable within a dataset. What the random subset gains over all candidates shifts by **+0.00648** on nfcorpus and **+0.00907** on SciFact just by moving from one epoch to 40 updates — comparable in size to the effects being measured. Change your training budget and you change how wrong the uncontrolled comparison is.

Equal-volume comparison isn't a new idea; the E5 filtering ablation does it. What two budgets over a fixed mined pool add is that the error has no fixed sign and no fixed size.

## The calibrated cutoff that filtered nothing

The same project had a second selector: instead of picking a cosine threshold by hand, derive it with split-conformal prediction from labelled positive pairs. A principled cutoff with a coverage guarantee.

On nfcorpus, at α = 0.2, it retained **every candidate pair** — 2742 of 2742, and likewise for the other two seeds. The hand-picked threshold kept about 540. The calibrated selector selected nothing, and the arm was never trained.

The guarantee was never violated; it just doesn't say what you want it to say. Conformal coverage is about **retaining future genuine positives**, not about limiting how many bad pairs you accept. And the two pair types weren't the same relationship at all. Calibration pairs were *documents judged relevant to the same query* — for one nfcorpus query that means studies of amla, black raspberry and acetaldehyde exposure sitting together, which are not paraphrases of each other. Candidates were *nearest neighbours in embedding space*, which are. Calibrate a cutoff on the loose relationship, apply it to the tight one, and everything gets through.

A theoretical guarantee about one event is not an operational property of your pipeline. Check what your rule actually retained.

## Geometry won't tell you either

If retrieval evaluation is expensive, the tempting shortcut is to look at the representation: alignment, uniformity, anisotropy, effective rank. Measured on these same runs, they point the wrong way.

On nfcorpus, training on all candidates spread the embeddings hardest — anisotropy 0.20744 → 0.04970 — and retrieved **worse than the untrained encoder**. Threshold spread them less and retrieved better. On SciFact, threshold's alignment distance *improved* between budgets while its retrieval *fell*. Both counterexamples hold in every individual seed.

Those descriptors measure something real. They just don't order retrievers.

## What I'd keep

Minimum controls for "does selecting my training data help":

- **Match every selector to a random control of its own size.** If a same-size random subset gets most of your gain, you measured volume.
- **Fix the training budget explicitly**, and record *actual optimiser updates* rather than epochs. Fewer pairs quietly means fewer steps.
- **Keep the unchanged model in every table.** Beating a matched control and improving on the starting checkpoint are separate questions — in my runs, only one dataset answered both positively.
- **Look at query-level differences.** My nfcorpus "wins" had a median difference of exactly zero: 103 queries improved, 152 unchanged, 69 regressed. Averages hide a lot of churn, and a couple of the largest "improvements" turned out to be one adjacent rank swap on a query with a single relevant document.

None of this makes a selector work. It tells you whether the one you have does — which is the cheaper question to answer first.
