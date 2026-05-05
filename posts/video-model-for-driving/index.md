---
title: A video model for driving, on a small budget
date: 2025-05-30
draft: true
---

*~12 min read. A walkthrough of [my master's thesis](paper.pdf), which built an autoregressive video forecaster for driving scenes with a deliberate split between what stays the same and what moves.*

Hold the next image of the road in your head. You can do it; it's most of what your visual system spends its time on. The brake lights ahead. The lane line drifting in your peripheral vision. The truck that hasn't shown up in your mirror yet but will in two seconds. Most of the time we don't even notice this is happening — it just feels like *seeing*.

Building a model that does the same thing turns out to be a lot of work.

This is a walkthrough of my thesis on the problem. The goal was modest: given a few seconds of dashcam video, predict the next frame, then the next, then the next. Two things are worth being honest about upfront. This is a *video model*, not an action-conditioned world model — no steering, no acceleration in the loop; we'll come back to actions at the end. And the architecture is dated. The project ran from August 2024 to May 2025, and by the time it wrapped, diffusion transformers on temporally-compressed video latents (Cosmos, the Sora-architecture lineage) had become the obvious default. Frame-level autoregression on top of a Stable Diffusion U-Net is a 2023 design point; I picked it early because it was tractable on a single GPU, and didn't revisit it as the field shifted. The bet was that you could get good rollouts on a small budget *if* you designed carefully around the failure modes that come with running a model on its own outputs.

The full mathematical story is in the [thesis](paper.pdf) — including ablations and dead ends I'm leaving out for length. This post is the high-level walk through.

## What we're trying to build

A *world model* is a learned predictor of an environment. Feed it a short history of frames, and it returns its best guess at the next one. Iterate, and you get a video — a possible future, generated frame by frame.

There are essentially two ways to build one.

The first is to generate a fixed-length clip in one shot. This is what most modern text-to-video systems do. It works well for short clips with strong global coherence, and it's the basis of most of the visually stunning video generation you've seen recently.

The second — the one we take — is to roll the video forward one frame at a time. The autoregressive framing is **causal**, in that the model never plans a clip's ending before it has finished its beginning, and *nominally* **interactive**, in that a controller or planner could in principle intervene between any two frames. *Could* is doing real work there: we never wired up actions in this iteration, so the interactivity is potential, not actual.

Most of the active driving-video work at the time — [GAIA-1](https://arxiv.org/abs/2309.17080), [DriveDreamer](https://arxiv.org/abs/2309.09777), [GenAD](https://arxiv.org/abs/2403.09630), [Vista](https://arxiv.org/abs/2405.17398), and later [Cosmos](https://arxiv.org/abs/2501.03575) — was doing the clip-at-a-time thing with DiTs on learned spacetime latents, at compute scales we didn't have and (in some cases) on weights that weren't released. Going AR with a Stable Diffusion U-Net wasn't ambitious; it was the option that fit on the GPU and kept the slow/fast question I cared about easy to ask.

![A partially observed framing. The world is some hidden state s_t that evolves under a transition F; we never see s_t directly, only the observations x_t that come out of it. Our model is the box trying to predict the next x_{t+1} from a short window of past x's. Whether the past frames carry enough information about s_t to do this well is the entire question.](pomdp.png)

The cost of this framing is **autoregressive drift**: errors at each step become inputs at the next step. They compound. Sometimes spectacularly. Most of the engineering in this thesis was about staying ahead of that compounding for as long as possible.

## A first attempt, and how it goes wrong

The cleanest possible architecture is the one we start with. Take the U-Net out of [Stable Diffusion](https://arxiv.org/abs/2112.10752) — already pretrained on a few billion images, so it knows what cars and roads and lighting look like. Encode the past five frames into latents using the SD VAE. Channel-stack those latents with a noised target, feed the whole thing into the U-Net, and let it denoise. Repeat the SD input convolution's weights across the new channels so we don't have to learn them from scratch.

Two architectural moves: more input channels, same everything else. We call this the **Visual Forecaster** (VF) baseline.

It works fine for the first dozen or so frames. It looks great for the first two or three. Then the rollout starts to slip. The lane lines smear. A car that was clearly red dims. A building's facade picks up a watercolor wobble. Sometimes the whole frame snaps over to *some other plausible road scene the model saw in training*, and the rollout never recovers.

Here's the failure pattern in one figure:

![Teacher forcing (top) gives the model perfect ground-truth context at every step. Autoregressive rollouts (bottom) feed the model its own predictions. Errors compound; by frame 200 the rollout has wandered somewhere the training data lives, even though the input scene was different. This is the gap we want to close.](tf_vs_autoreg.png)

The standard knob for this is **diffusion forcing**: at training time, perturb the *context* frames with a small amount of noise, on top of the noise we already inject into the target. The model learns to denoise inputs that are slightly off-distribution — practice for what its own predictions will look like at inference. There's a hyperparameter $b_{\max}$, the maximum context-noise level, and the trade-off it controls is the recurring shape of the rest of the post.

![Effect of varying the context-noise level on autoregressive rollouts. Low noise gives sharper single-frame predictions but more drift; high noise stabilizes the rollout but blurs detail. No setting is uniformly best — the right value scales with image resolution and how long you intend to roll out.](noise_comp.png)

Diffusion forcing helps, and we use it throughout. But on its own it caps out well before the model is genuinely robust to its own outputs.

## The split: slow scene, fast motion

The intuition behind the rest of the method is a kind of frequency decomposition.

In a driving scene, two timescales are doing work at once. The *slow* one is the scene itself — buildings stay where they are, lighting changes gradually, the road surface and lane markings persist. The *fast* one is everything in motion — the cars around you, the precise position of your own vehicle, the moving foliage.

A model conditioned only on a few past frames sees both at once, jumbled together in five RGB tensors. As the rollout proceeds, the conditioning slowly drifts off the original scene, and "what was supposed to stay the same" drifts with it. The lighting's color drifts. The lane width varies. A nearby parked car gradually morphs into a different car.

The remedy: hold the slow stuff out separately, in a representation that doesn't update every frame. We extract the patch embeddings from a pretrained [DINOv2](https://arxiv.org/abs/2304.07193) ViT — a self-supervised vision model whose representations are unusually stable across small perceptual changes — and condition the diffusion U-Net on a *running average* of those embeddings over the context window.

![Extracting the scene-level embedding. Each context frame goes through a frozen DINOv2 ViT, producing patch embeddings that summarize "what is in this part of the image" at a level less brittle than raw pixels. We average across the context window and inject the result into the U-Net's cross-attention. The point is not that DINO is the best possible embedding — it is that DINO is stable enough that averaging across context frames yields a meaningful signal rather than mush.](dino_sle.png)

The model still gets the past frames as channel-stacked latents. But it now also gets a slowly-evolving scene token through cross-attention. When the per-frame latents drift, the scene token is still there, anchoring the next prediction to the lighting, geometry, and identity of the place we started in.

We call the patch-conditioned variant **VF-S**. We also try a coarser version that uses only the DINO class token (a single global vector summarizing the whole frame), called **VF-SC**. As we'll see, *which* DINO features you use matters a lot.

![The full architecture. The five context latents and one noised target latent come in along the channel dimension. The DINO scene embedding comes in via cross-attention, alongside any other conditioning. The U-Net is fine-tuned end to end from the Stable Diffusion checkpoint. Two changes from stock SD — channel-stacked context, scene-token cross-attention. The rest is inherited.](architecture.png)

## A metric for drift

This came out of an empirical frustration. When I benchmarked the baselines side by side, every model visibly drifted in long rollouts — lane lines smeared, buildings wobbled, colors washed out — but FVD and LPIPS scored them as roughly fine. The numbers and the rollouts were telling different stories, and the rollouts were right. Part of the reason is structural: FVD, LPIPS, and PSNR conflate the inherent stochasticity of the future, the model's compounding error, and the scene's natural evolution into one aggregate "is this realistic" number. Part of it is dataset-specific: on a small driving dataset, FVD particularly rewards rollouts that *converge* to common training-scene appearances, even when the rollout has wandered far from the test scene it started in. That's exactly the failure mode we wanted the metric to catch.

So we wrote down a more direct one. Let $\Phi$ be a deep perceptual encoder. Define

$$
\mathcal{D}(t) \;=\; \frac{\|\Phi(\hat x_t) - \Phi(x_t)\|_2}{\|\Phi(x_0) - \Phi(x_t)\|_2}.
$$

Numerator: how far is our prediction from the ground truth at time $t$? Denominator: how much has the *scene itself* evolved between frame zero and frame $t$? The ratio normalizes the prediction error against the natural change in the scene.

Three regimes:

- $\mathcal{D}(t) < 1$: the prediction is closer to the future frame than the original frame was. The model is genuinely tracking the future.
- $\mathcal{D}(t) \approx 1$: the model is no better than just keeping the original frame. Plausible-but-uninformed.
- $\mathcal{D}(t) > 1$: the prediction has drifted *further* from the future frame than the original. Actively wrong.

The window we care most about is the early-to-middle: the first few seconds of rollout, before the future is genuinely uncertain, where the model should still be tracking the truth. This is where the scene token has the most to do.

<iframe src="ar-drift.html" height="460"></iframe>

A few things to read off the plot. **Every model spikes at $t = 0$**, because $\Phi(x_0) - \Phi(x_t)$ is nearly zero there — the metric is undefined-ish at the start, which is fine; we never claimed otherwise. **In the high-drift window** ($t \in [25, 100]$), VF-S sits noticeably below the others, often dipping under $\mathcal{D}(t) = 1$ — its predictions are *closer to the future* than the past was. The other variants, including the GameNGen reimplementation, hover above 1 in that window: technically wrong, by their own metric. **Beyond $t \approx 100$**, the ground-truth future has diverged enough that even a perfect model would float up around 1, and the metric stops carrying signal.

Toggle the curves on and off in the plot above to see the shape of each variant. The most informative pair is VF-S vs. VF-SC: same scene-token idea, but VF-SC uses only the global DINO class token. **The class token is one vector summarizing the whole frame; the patch tokens carry localized semantic information.** Collapsing all of that into a single vector destroys the spatial structure that lets the model anchor the rollout — and that's exactly what the curve shows.

The metric isn't perfect, in two ways worth naming. It depends on the perceptual encoder Φ — a model whose conditioning *is* a Φ-style embedding will look better in Φ-space, so a fair comparison wants at least two encoders (a non-DINO option like RADIO or CLIP would be the obvious second). And the denominator is unstable when the scene barely evolves, which is part of why the early-time spikes are uninformative and why we carve out windows visually instead of reporting a single scalar. As an internal compass for model selection it was much sharper than FVD; as a community benchmark it would need careful work on both fronts.

## The qualitative result

The drift metric is useful but abstract; what you actually want to see is whether the rollouts *look* better.

![Autoregressive rollouts on out-of-distribution scenes (held-out road segments). Time runs left to right. Top to bottom: VF-S (ours), VF (no scene token), and the GameNGen reimplementation. VF-S keeps the lighting, road geometry, and surrounding vehicles coherent through more of the rollout; the baselines drift toward generic-looking scenes from the training distribution within a couple of seconds.](autoreg_qual.jpg)

On the headline number — FVD on out-of-distribution 16-frame rollouts — VF-S brings drift from ~200 (the GameNGen reimplementation and the no-scene-token VF baseline) down to ~59. Single-frame metrics (PSNR, LPIPS) improve modestly; the big delta is on the *video-level* metrics, which is what we'd expect if scene-level drift is the dominant failure mode.

The class-token vs. patch-token ablation is also stark in pictures, not just in the curve:

![Ablation between scene-token variants. Top: full DINO patch embeddings (VF-S). Bottom: DINO CLS token only (VF-SC). The patch version preserves spatial structure across the rollout; the CLS-only version drifts visibly within a few seconds even though both have access to "DINO information." Spatial structure in the conditioning, not just semantic content, is what stabilizes the rollout.](sle_ablation.jpg)

## What worked, what didn't, what's still open

A few honest takeaways from spending a year on this.

**The split worked.** Conditioning on a slow, semantically stable representation alongside the fast per-frame latents is the single change that closed the most ground against the baseline. It is also a very reusable idea: any autoregressive image or video model that sees its own outputs at inference time has the same drift problem, and any pretrained vision encoder with stable patch-level representations is a candidate for the slow channel.

**Patch-level conditioning matters more than I expected.** Going in, I assumed the global CLS token would carry enough scene information to anchor the rollout. It didn't. The localized spatial structure in the patch tokens is what makes the difference, presumably because the U-Net's cross-attention can spatially align it with the latent it's denoising. Replace the patch grid with a single vector and you lose the alignment, even if the semantic information is technically still there.

**FVD is a lousy measure of drift.** It gives a number that goes down when the rollout looks like the training distribution. On large datasets, that's roughly correlated with "the model is good." On a small dataset, it confidently rewards a model that has fled the test scene to hide in the training set. The $\mathcal{D}(t)$ metric was the second-most useful thing we built, after the model itself; without it, we'd have shipped the wrong story about which variant was best.

**Things I didn't get to.**

- **Actions, via inverse dynamics.** The natural next step. Two consecutive frames imply an action: train an inverse-dynamics head ($\hat x_t, x_{t+1} \to a_t$), and the world model becomes a planner — roll forward under candidate action sequences, score the rollouts, pick the best. This is the version of the project where it stops being a video model and starts being a world model in the action-conditioned sense.
- **DiTs on a learned video latent.** Redo the experiment with a DiT on a temporally-compressed spacetime latent — the pattern Cosmos, Sora, and the open video models converged on. The slow/fast split slots in as cross-attention conditioning the same way it does here; whether the scene token still earns its keep at that scale is the comparison I'd most like to see run.
- **Object-level decomposition.** Patches are localized but not aligned to objects. A car drifting through the patch grid still aliases. An object-centric variant — where the slow conditioning attaches to detected entities rather than spatial patches — feels like a clean next step.
- **Long-horizon memory.** The running average of context embeddings is the simplest possible form of memory. It mixes the same way every step. A learned aggregator could likely keep the scene token sharp for longer, especially on rollouts of more than five to ten seconds.
- **3D grounding.** A lot of drift is, in retrospect, the model's failure to maintain a consistent world geometry across viewpoints. A representation that bakes in 3D — NeRF, Gaussian splatting — might absorb the part of the drift problem that a 2D scene token can't.

The thing I'd most like a reader to take away from this version of the story is the framing. An autoregressive world model is a stack of conditioning channels arguing about what to keep stable, and the cleanest interventions are the ones that disentangle which channels move at which timescales. Most of the rest is engineering around that split.

Full math, the experiments I left out for length (classifier-free guidance, image-to-image inference, training on generated frames, the resolution / noise-level scaling story), and the boring details are in the [thesis](paper.pdf).
