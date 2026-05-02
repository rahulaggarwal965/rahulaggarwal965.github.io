---
title: Noise vs data distributions
date: 2026-04-15
---

A short note (placeholder — replace with your actual writeup). The interactive figure below shows the relationship between the noise distribution and the data distribution.

<iframe src="/viz/noise_vs_data_distributions.html" height="480"></iframe>

The score function is the gradient of the log density:

$$
s_\theta(x) = \nabla_x \log p_\theta(x)
$$

so the denoising objective minimizes

$$
\mathbb{E}_{x \sim p_\text{data},\, \tilde{x} \sim q_\sigma(\tilde{x}\mid x)} \big[\, \| s_\theta(\tilde{x}) - \nabla_{\tilde{x}} \log q_\sigma(\tilde{x}\mid x)\|^2 \,\big].
$$

Replace this body with the real explanation; the embed and math just demonstrate that the template handles them.
