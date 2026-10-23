---
title: "Hard Negatives Made My Retriever Worse"
date: 2026-10-20
description: "BM25-mined hard negatives are supposed to sharpen a dense retriever. On FiQA they lost to uniformly random negatives in all three seeds — and the blind review I ran to explain why refused to confirm the obvious story."
tags: ["retrieval", "contrastive-learning", "evaluation"]
---

Hard-negative mining is one of those practices that arrives pre-justified. Train a dense retriever against documents that are *almost* right instead of random ones, and it has to learn a sharper decision boundary. The reasoning is clean enough that it mostly gets repeated rather than tested.

I tested it, as [a project for a machine-learning subject](/projects/hard-negatives), and it lost.

## The one variable

The experiment fixes everything that normally varies between hard-negative papers — encoder, positives, number of negatives, batch size, temperature, learning rate, step count — and changes exactly one thing: **where the one extra negative per query comes from.**

- **E1** — uniform from the corpus.
- **E2** — uniform from BM25's top 20 for that query, after removing known answers, exact-text duplicates, and documents BM25 scored zero (those are ordered by corpus position, not relevance — "hard" negatives that are just whatever happened to be early in the file).

Everything else is shared: `all-MiniLM-L6-v2` at a pinned commit, a masked InfoNCE loss I wrote by hand, batch 32, τ = 0.05, two epochs, three paired seeds. The test split raises an error in code unless explicitly unsealed, and it was opened once, after the method was frozen.

## It wasn't close

| Method (test, 648 queries) | NDCG@10 | Recall@10 |
|---|---:|---:|
| BM25 | 0.2337 | 0.3005 |
| Original MiniLM, no fine-tuning | 0.3687 | 0.4413 |
| **E1 random negatives** | **0.3974** | **0.4724** |
| E2 BM25-hard negatives | 0.3812 | 0.4519 |

E2 − E1 is **−0.0162** NDCG@10, 95% CI [−0.0241, −0.0085]. Negative in all three seeds (−0.0191, −0.0147, −0.0148), with a seed-to-seed spread about six times smaller than the effect.

The more convincing version is the training curves: across all three seeds, **every** E2 checkpoint sits below **every** E1 checkpoint. There is no checkpoint-selection story here, no unlucky seed.

Hard negatives weren't useless — E2 still improved on the untrained encoder by +0.0126 [+0.0012, +0.0240]. They just retained about 44% of the gain that *random sampling* delivered for the same compute.

## The part I couldn't prove

The textbook explanation is false negatives. BM25's top 20 contains unlabelled correct answers; FiQA has only ~2.5 labelled answers per query; the loss shoves those unlabelled answers away from the query and the model learns something false.

It's a good story. I tried to check it instead of writing it down.

I sampled 40 `(query, negative)` pairs — 20 from each arm — shuffled them, stripped the source and the BM25 rank, and labelled all of them by hand before opening the key.

| | relevant | partially | not relevant |
|---|---:|---:|---:|
| E1 random (20) | 1 | 0 | 19 |
| E2 BM25-hard (20) | 3 | 6 | 11 |

Clearly-relevant negatives — false negatives in the strict sense — were rare in **both** arms. 3/20 against 1/20, Fisher's exact *p* = 0.61. Forty pairs cannot establish that difference.

What the review does show is different, and more interesting: hard negatives are far more often **on topic without answering the question** — 9/20 against 1/20, *p* = 0.008.

That is not the same claim. An on-topic non-answer is arguably the *ideal* hard negative; NDCG explicitly rewards ranking the true answer above it. So the review documents what E2 samples without showing that what it samples is wrong. Three candidate causes stayed tangled in my design:

1. label noise among the hard negatives,
2. the harder optimisation problem of separating topically-dense documents,
3. hyper-parameters I fixed at the defaults for the *random* setting — the learning rate and temperature that suit random negatives have no obligation to suit hard ones.

The design isolates the negative source as the cause of the **gap**. It does not isolate the mechanism behind the gap. Those are different results, and it would have been easy — and wrong — to report the first as the second.

## What I'd actually change

Not "more data". Each of these targets one of the three confounds:

- **Filter the mined negatives with a cross-encoder** and drop the ones it scores as relevant. If false negatives are the cause, this recovers the gap.
- **Sample from BM25 ranks 30–100** instead of 1–20 — less hardness, better label reliability.
- **Sweep learning rate and τ for E2 specifically.** If hard negatives just need a gentler schedule, that is a tuning result, not a mining result.
- **Repeat at batch 64.** With 64 shared candidates, one extra negative is a smaller share of the denominator; if the effect shrinks, it was about dominance rather than hardness.

## The takeaway

The conclusion is scoped to one configuration — FiQA, MiniLM, B = 32, τ = 0.05, BM25 ranks 1–20 — and I'd be overclaiming to call it a result about hard negatives in general. But the cheap, generalisable part is this: **the thing worth building into the experiment is the control, not the clever intervention.** A single swapped variable and three paired seeds cost about 37 minutes on a free Colab T4, and produced a usable answer about my setup that no amount of reading would have given me.

The other half is knowing when to stop. I had a clean result and a plausible mechanism, and the blind review — forty pairs, one annotator, an afternoon — said the mechanism wasn't supported. Reporting the gap without it is a less satisfying write-up and a more honest one.
