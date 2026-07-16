---
title: "SMOTE Didn't Help: Imbalance Strategies on Real Credit Data"
date: 2026-07-15
description: "On an 80:20 loan-default dataset, class weights and SMOTE — the textbook fixes — made minority-class F1 worse or changed nothing. A head-to-head comparison, and what actually moved the needle."
tags: ["machine-learning", "imbalanced-data", "scikit-learn"]
---

Every tutorial on imbalanced classification reaches for the same two tools: `class_weight='balanced'` and SMOTE. While building my [loan-default prediction pipeline](/projects/loan-repayment) (~80:20 imbalance, default = minority class), I decided to measure them instead of assuming — same folds, same pipeline, three strategies head-to-head.

## Setup

Target metric is **minority-class F1** (`pos_label=0`, the defaulters) — accuracy is meaningless when 80% accuracy is achievable by predicting "repaid" for everyone. Everything runs inside an sklearn/imblearn `Pipeline` with 5-fold stratified CV, which matters more than it sounds: **SMOTE must be applied inside each training fold only**. Oversample before splitting and synthetic copies of test-fold points leak into training — your CV score inflates and the "improvement" evaporates on real data.

## Results

5-fold CV, identical folds across strategies:

| Model | Strategy | F1 (default) | Precision | Recall |
|---|---|---|---|---|
| Logistic Regression | baseline | **0.661** | 0.812 | 0.558 |
| Logistic Regression | class_weight | 0.606 | 0.514 | 0.739 |
| Logistic Regression | SMOTE | 0.608 | 0.525 | 0.724 |
| Random Forest | baseline | **0.675** | 0.934 | 0.529 |
| Random Forest | class_weight | 0.670 | 0.938 | 0.521 |
| Random Forest | SMOTE | 0.672 | 0.908 | 0.533 |

![Imbalance strategy comparison](/posts/imbalance_comparison.png)

Two patterns, neither of them the tutorial's promise:

**Logistic regression: a trade, not a win.** Both fixes did exactly what they advertise — recall jumped from 0.56 to ~0.73. But precision collapsed from 0.81 to ~0.52, and F1 *dropped five points*. Rebalancing didn't teach the model anything new about defaulters; it just moved the operating point along the same precision-recall curve, into a region my metric doesn't prefer.

**Random forest: nothing happened.** All three strategies land within one standard deviation of each other. Trees carve out minority regions regardless of class weights, and SMOTE's linear interpolation between minority neighbours adds little a forest wasn't already modeling.

Meanwhile the eventual best models — Gradient Boosting (test F1 **0.714**) and XGBoost — used *no* rebalancing at all. Boosting's sequential reweighting already concentrates on misclassified examples, which on imbalanced data are disproportionately the minority class. It's an imbalance handler that ships inside the algorithm.

## The underlying point

Rebalancing mostly **shifts where on the precision-recall curve you sit — it doesn't add information**. And if shifting the operating point is all you need, there's a cheaper knob with no side effects: **move the decision threshold**. It costs one line, needs no synthetic data, and doesn't distort probability calibration (my final model's Brier score: 0.077). Interestingly, sweeping thresholds on out-of-fold predictions confirmed 0.5 was already F1-optimal for the tuned XGBoost — another "fix" that had nothing left to fix.

## Takeaways

1. **Pick the metric first**, then check whether a "fix" improves *that metric* — recall going up is not the same as the model getting better.
2. **Try the threshold before the sampler.** If a threshold move achieves the same trade-off, SMOTE was complexity for nothing.
3. **If you do resample, do it inside the CV pipeline** — outside-the-fold SMOTE is a leakage bug that flatters your scores.
4. Benchmarks like this cost one script ([`compare_imbalance.py`](https://github.com/EricLin09/Predicting-Loan-Repayment)) and save you from shipping cargo-cult preprocessing.
