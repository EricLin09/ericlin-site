---
title: "Do Hard Negatives Always Help?"
date: 2026-10-20
description: "Fine-tuning MiniLM for retrieval on FiQA with a hand-written masked InfoNCE loss, changing exactly one thing: where the extra negative comes from. BM25-hard negatives lost to random ones in all three seeds."
tech: ["Python", "PyTorch", "Transformers", "BEIR", "InfoNCE"]
demo: "https://colab.research.google.com/drive/1pYZOUUg1QUp5R6pCEEO2ISqna5UlEc0n"
status: "completed"
---

Hard-negative mining is close to folklore in dense retrieval: if you train an encoder against negatives that are *almost* right, it has to learn a sharper boundary than it would against random documents. I wanted to measure it rather than inherit it.

So this project holds everything else fixed — same encoder, same positives, same number of negatives, same training budget — and changes **one thing**: where the extra negative per query comes from.

- **E1** — one extra negative sampled uniformly from the corpus.
- **E2** — one extra negative sampled uniformly from BM25's top 20 for that query, after removing known answers, exact-text duplicates and zero-score documents.

**The answer, in this configuration: no.** BM25-hard negatives were worse than random ones, in every seed.

## Setup

| | |
|---|---|
| Data | BEIR FiQA-2018 — 57,638 documents; 5,500 / 500 / 648 train / dev / test queries; ~2.5 labelled answers per query |
| Encoder | `all-MiniLM-L6-v2` (pinned commit `1110a243`), mean pooling + L2 normalisation, all 22.7M parameters trained |
| Loss | masked InfoNCE, written from scratch — softmax cross-entropy over the in-batch candidates, with a query's *other* known answers masked out of the denominator; τ = 0.05 |
| Training | batch 32 (64 shared candidates), AdamW, lr 2e-5, 10% warm-up, 2 epochs = 342 steps, fp16 Transformer with an **fp32 loss region** |
| Protocol | 3 paired seeds (13, 42, 2026); dev NDCG@10 at 4 checkpoints selects the model; test sealed in code and opened **once**, on 29 September 2026 |
| Statistics | paired query bootstrap, 10,000 resamples, on per-query differences averaged over seeds |

Baselines: **B0** BM25 (`k₁=1.5`, `b=0.75`), and **B1** the original MiniLM with no fine-tuning by this project.

## Results

Test split, 648 queries, evaluated once after the method was frozen:

| Method | NDCG@10 | Recall@10 | Recall@100 |
|---|---:|---:|---:|
| B0 BM25 | 0.2337 | 0.3005 | 0.5068 |
| B1 original MiniLM | 0.3687 | 0.4413 | 0.7061 |
| **E1 random negatives** (mean of 3 seeds) | **0.3974** | **0.4724** | **0.7319** |
| E2 BM25-hard negatives (mean of 3 seeds) | 0.3812 | 0.4519 | 0.7117 |

Paired differences in NDCG@10, with 95% intervals:

| Contrast | Difference | 95% CI |
|---|---:|---:|
| **E2 − E1** | **−0.0162** | [−0.0241, −0.0085] |
| E1 − B1 | +0.0288 | [+0.0198, +0.0378] |
| E2 − B1 | +0.0126 | [+0.0012, +0.0240] |

Hard negatives didn't just fail to win — they kept only about **44% of the gain** that random negatives produced over the untrained encoder.

![Dev NDCG@10 at every evaluation point of all six runs](/projects/hard-negatives/dev-curves.svg)

The curves matter more than the final numbers. For every seed, **all four E2 checkpoints lie below all four E1 checkpoints**, so the gap isn't an artefact of which checkpoint got picked. Seed-to-seed spread on E2 − E1 is 0.0035 — roughly six times smaller than the effect.

## The gap is established; its cause isn't

The obvious story is false negatives: BM25's top 20 contains unlabelled answers, the loss pushes them away, the model learns something wrong. I tried to check it rather than assert it.

I hand-labelled 40 sampled `(query, negative)` pairs **blind** — shuffled, shown without their source or BM25 rank, with the key opened only after all 40 labels were saved:

| | relevant | partially | not relevant |
|---|---:|---:|---:|
| E1 random (20) | 1 | 0 | 19 |
| E2 BM25-hard (20) | 3 | 6 | 11 |

Clearly-relevant negatives — false negatives in the strict sense — were rare in both groups (3/20 vs 1/20; Fisher's exact *p* = 0.61). The difference that *is* clear is that hard negatives are far more often **on topic without answering the question** (9/20 vs 1/20, *p* = 0.008).

That is a description of what E2 samples, not a mechanism. An on-topic non-answer may be exactly the informative negative that mining is supposed to produce, and NDCG does reward ranking the true answer above it. Three explanations stay confounded in this design:

1. label noise among the hard negatives,
2. the greater optimisation difficulty of separating on-topic documents,
3. hyper-parameters (lr, τ, step count) fixed at values tuned for the *random* setting.

## Engineering notes

- **The fp32 boundary is not optional.** Calling `.float()` on embeddings inside an `autocast` region does nothing — the matrix product gets cast back to fp16. Autocast now wraps only the Transformer forward pass; pooling, normalisation, the similarity matrix and the loss run outside it, with a dtype assertion in the loss to enforce it.
- **`GradScaler` skips steps.** When gradients overflow, the optimiser step is skipped, which would have made a "gradients are finite" check fail spuriously. Skipped steps are detected from the change in loss scale and excluded (0 occurred in the end).
- **"Hard" negatives that weren't.** Some documents duplicate a positive's text verbatim, and BM25 orders zero-score documents by corpus position. Both are filtered by an exclusion set and a positive-score requirement.
- **Sealed test.** Evaluating on test raises an error unless `TEST_UNSEALED` is set. Batch size and method were frozen and logged before the corresponding results were seen.
- **Resumability.** A free-tier Colab runtime was recycled and wiped a complete three-seed run before download. None of its numbers had been seen, so the rerun is uncontaminated — but runs now stream to Drive as they finish, and a finished run is skipped on re-execution only if its config and sampling-plan hashes match.

Re-running seed 13 on the same hardware reproduced the E1 dev score to within ~10⁻⁶ (0.408616 vs 0.408617).

## Limitations

One dataset, one encoder, one batch size, one temperature. 19.15% of documents are truncated at 256 tokens. MiniLM's pre-training data includes StackExchange and Reddit — the same sources as FiQA — and text overlap was never audited, so none of this is a claim about generalisation to unseen text. The manual review is 40 pairs by one annotator with no finance background.

## What I'd try next

Each of these targets an observed failure mode rather than "more data":

- **Denoised hard negatives** — filter mined negatives with a cross-encoder and drop the ones scored relevant.
- **Rank-range sampling** — draw from BM25 ranks 30–100 instead of 1–20, trading hardness for label reliability.
- **Soft or multi-positive targets** that don't force unlabelled neighbours to probability zero.
- **Re-mining with the dense model itself**, ANCE-style.
- **Repeat at B=64 and several τ**, to test whether the effect depends on how dominant the single extra negative is.

Written up as a report for UTS 32513 Advanced Data Analytics Algorithms. The whole experiment — download, preprocessing, negative sampling, loss, training, evaluation — runs top-to-bottom in the linked Colab notebook on a free T4; six training runs take about 37 minutes.
