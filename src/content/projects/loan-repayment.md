---
title: "Loan Default Prediction"
date: 2026-05-15
description: "An end-to-end credit-risk pipeline benchmarking 9 classifiers plus a soft-voting ensemble — leakage-free cross-validation, imbalance-strategy comparison, and SHAP interpretability."
tech: ["Python", "scikit-learn", "XGBoost", "imbalanced-learn", "SHAP"]
repo: "https://github.com/EricLin09/Predicting-Loan-Repayment"
status: "completed"
---

An end-to-end machine-learning pipeline that predicts whether a borrower will repay a loan, benchmarking **9 classifiers + a soft-voting ensemble** under a leakage-free, cross-validated workflow.

The positive class of interest is **default**, so all scoring uses `pos_label=0` and the project optimises **minority-class F1** rather than accuracy — accuracy is misleading on this ~80:20 imbalance.

## Results

Hold-out test set (stratified 20%, never seen during training or tuning):

| Model | F1 (default) | Precision | Recall | ROC-AUC |
|---|---:|---:|---:|---:|
| **Gradient Boosting** | **0.714** | 0.962 | 0.567 | 0.893 |
| Soft-Voting Ensemble | 0.710 | 0.971 | 0.559 | 0.891 |
| XGBoost | 0.707 | 0.940 | 0.566 | 0.891 |
| Random Forest | 0.702 | 0.957 | 0.555 | 0.882 |
| AdaBoost | 0.684 | 0.837 | 0.579 | 0.881 |
| Logistic Regression | 0.615 | 0.526 | 0.741 | 0.887 |

![ROC curves for all models on the hold-out test set](/projects/loan-repayment/roc_curves_all-light.png)

Top default drivers (permutation importance + SHAP): **employment status, credit score, debt-to-income ratio**.

![SHAP summary for the best model](/projects/loan-repayment/shap_summary_best-light.png)

## Key Engineering Decisions

- **No data leakage** — all preprocessing (encoding, scaling, SMOTE) lives inside an sklearn / imblearn `Pipeline`, so it is re-fit on every CV fold.
- **Class imbalance handled and quantified** — `baseline` vs `class_weight='balanced'` vs `SMOTE` compared head-to-head on the same folds, rather than picking one on faith.
- **Feature engineering** — four ratio features: `loan_to_income`, `installment_to_monthly_income`, `credit_utilisation`, `is_delinquent`.
- **Hyperparameter tuning** — 5-fold `StratifiedKFold` + `GridSearchCV`, scored on `f1(pos_label=0)`.
- **Interpretability** — permutation importance, SHAP summary, calibration (Brier score + reliability diagram), and a decision-threshold sweep.
- **Resumable training** — interrupted runs skip already-trained models on re-run.

Also includes an unsupervised **k-Means borrower segmentation** as a complementary analysis.
