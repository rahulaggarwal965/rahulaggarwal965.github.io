---
title: Lifting 2D Semantics into 3D with Hash-Grid Attention
date: 2023-12-15
draft: true
---

*~12 min read. A walkthrough of [a research project](paper.pdf) where I tried to make off-the-shelf 2D semantic segmentation behave more sensibly in 3D.*

**Contents.** [The same chair, four labels](#hook) · [Lifting, and where it gets stuck](#lifting) · [The hash grid is already telling us something](#hashgrid) · [Attention on the neighborhood](#attention) · [The full picture](#architecture) · [From points to pixels](#rendering) · [Closing the loop](#distillation) · [What the numbers say](#results) · [What didn't work](#failures) · [Closing](#closing)

---

A 2D semantic segmentation model — the kind every robot, AR headset, and self-driving stack ships with somewhere — does one job: take an image, return a per-pixel label. The models that exist are excellent at this. They are also, in a way that is annoying once you notice it, incoherent. Show one the same chair from three angles and you might get *armchair*, *chair*, and *ottoman* back. The pixels disagree with themselves the moment the camera moves.

That incoherence is the whole reason this project exists. The fix I chased — a small architectural tweak on top of Instant-NGP — turned out to be more interesting than the metric improvements it produced, so this post leans on intuition and visualizations more than on tables. The paper has the rigor; this is the picture I wish I'd had before I started.

## The same chair, four labels <a id="hook"></a>

Before anything else, the symptom.

<iframe src="multiview-inconsistency.html" height="540"></iframe>

*A simulated indoor scene under a roving camera. The right panel is what an off-the-shelf 2D segmenter labels each object. Nothing in the scene moves. Yet the chair drifts between four labels, the couch flips between **couch** and **sofa**, and even the wall reclassifies itself once the camera looks at it from a different angle. This is the failure mode every downstream consumer of segmentation has to deal with.*

The fundamental issue is that a 2D model has no notion of 3D. Each frame is processed independently; nothing tells the network "this is the same patch of geometry you labelled five frames ago." Worse, the labelling itself is pixel-by-pixel: even within a single image, two pixels that the network is reasoning about have no shared geometric constraint, and across two images, two pixels that lie on the same epipolar line — that is, two projections of the very same 3D point from different views — can be classified entirely differently. Multi-view consistency, in essence, is a property the network was never asked to provide.

A natural response is to add the missing 3D structure *afterward*. Run the 2D model on every training view, lift its outputs into a 3D representation that has multi-view consistency baked in by construction, and read consistent labels back out wherever you need them.

That family of methods is called **semantic lifting**, and it is where this story starts.

## Lifting, and where it gets stuck <a id="lifting"></a>

The lifting framework was introduced by Semantic-NeRF and extended by Panoptic Lifting, DM-NeRF, and others. The recipe is: train a NeRF-like field that jointly models color and a per-point semantic distribution, supervise the semantic head with the (noisy, inconsistent) outputs of a 2D segmenter, and let the volumetric-rendering integral resolve the disagreements. Two views that label the same chair differently both contribute gradient to the same 3D region; the field learns the most-supported answer; the rendered labels at any new view are clean.

This works. It also has a structural limitation that bothered me. In every existing lifter, the semantic field is a *function of position* — given coordinate $\mathbf{x}$, return a class distribution. The semantic answer is bound to where in space you are, which is fine if you only ever care about *this* scene. The catch is that none of what the lifter learned about "what makes a couch look couch-shaped" is portable. Show it a new room and you have to re-fit from scratch. The 3D consistency was a property of *coordinates*, not of structure.

I wanted the consistency to come from the local geometry of the scene representation itself — to be a property of the *embedding neighborhood* around a query point, not of its coordinate. If that worked, the lifted field could in principle help the 2D model improve even on scenes it had never seen.

## The hash grid is already telling us something <a id="hashgrid"></a>

The substrate I started from is [Instant-NGP](https://arxiv.org/abs/2201.05989). Instead of representing a scene with a coordinate-based MLP, Instant-NGP places a stack of small, multi-resolution feature grids over the scene volume. Each grid stores a learnable feature vector at every vertex; the per-coordinate feature is read by trilinear interpolation between the eight surrounding vertices. The MLP that turns features into densities and colors is small and almost incidental — most of the scene's "knowledge" lives in the grid.

The detail that matters for what comes next: a query point doesn't read from a function. It reads from *vertices*. And those vertices, by virtue of being optimized to reconstruct a 3D scene, have to encode something locally meaningful — geometry, surface, occupancy, view-dependent appearance. The same eight vertices get hit by every ray that passes through that small region of space, regardless of which view that ray came from. By construction, they are 3D-consistent.

<iframe src="hashgrid-sampling.html" height="520"></iframe>

*A 2D analogue of an Instant-NGP feature grid at three resolutions. Drag the query point in any panel — it moves in all three at once. In **interpolate** mode each level returns the four corner vertices used for bilinear interpolation. In **gather neighborhood** mode each level instead returns the K nearest vertices as a sequence — the same data, restructured for a downstream module to reason about. The vertex colors are a deterministic hash, a stand-in for the embeddings the network actually learns to store.*

Two things are worth pulling out of that picture. First, every level encodes the same scene at a different scale: the coarse level sees a whole room of context per vertex, the fine level sees a corner of a table. Second — and this is the move the paper turns on — once you've decided to gather the local vertex *neighborhood*, you have something interesting on your hands: a small, structured set of features that already carry 3D-consistent information, indexed by no more than a query point.

The question is what you do with that set.

## Attention on the neighborhood <a id="attention"></a>

Trilinear interpolation does the obvious thing — a fixed weighted average. But fixed weights throw away an opportunity. If two of the eight corner vertices happen to have very different feature embeddings, the interpolated result splits the difference, even when the right answer is to listen to one and ignore the other.

Self-attention is the natural fix. Treat the K nearest vertices as a sequence; let the network learn, for each level, what fraction of attention to put on each neighbor; let the output be the weighted average that *attention* dictates rather than the one *trilinear interpolation* dictates. Whatever the output is, it remains a function of the same local vertex neighborhood — so 3D consistency is preserved for free.

The intuition I find clearest is to think of attention here as **soft clustering on the local embedding neighborhood**. Vertices that are semantically similar (under whatever the network has learned) get high attention to each other; vertices that look like noise get pushed down. The output is whatever the dominant cluster says.

<iframe src="attention-as-clustering.html" height="540"></iframe>

*Eight vertex embeddings drawn in a 2D feature space. The left panel shows the inputs; the right shows the output of one self-attention pass with Q = K = V = inputs. At high temperature the weights are nearly uniform and every output collapses to the centroid. At low temperature each vertex attends almost only to itself — nothing changes. In between, attention pulls each vertex toward its nearest cluster; the noisy outlier in the middle drifts toward whichever cluster is closest. That is, in essence, what we want a denoising step on a noisy semantic neighborhood to do. Drag any input point to see the effect propagate.*

The full operation in AttentioNGP is the natural extension of this picture to a multi-resolution grid. For each query point $q$ along a ray, and for each level $l$ of the hash grid:

1. Read the bilinear-/trilinear-interpolated feature at $q$ — this is the "query" vertex of the sequence.
2. Read the $K_l$ nearest grid vertices around $q$ — these are the "context" vertices.
3. Run $M$ layers of self-attention over the resulting sequence of $K_l + 1$ vectors.
4. Take the first row of the output (the post-attention "query" vertex) as the level-$l$ semantic feature.

The query point's full semantic feature is the concatenation of these post-attention vectors across levels. A small MLP reads them out into a class distribution. Geometry (density and color) is computed exactly the way vanilla Instant-NGP would, with no contribution from the attention block — we stop the gradient between the attention output and the hash grid so the RGB pipeline is, in essence, untouched. This was a deliberate choice. The original Semantic-NeRF formulation lets semantic loss flow back into the density field, which trades RGB sharpness for semantic accuracy. We didn't want to pay that.

## The full picture <a id="architecture"></a>

Putting all of that into one architecture diagram:

![The AttentioNGP field. A 3D query point drives a structured sampling of the multi-resolution hash grid: trilinear interpolation gives the query vertex; the K nearest grid vertices at each level make up the rest of the sequence. Layer-wise self-attention turns the sequence into a denoised query feature, level by level; concatenation across levels assembles the full semantic embedding; an MLP reads out the class distribution. Density and color come straight from the standard Instant-NGP path, with gradients to the hash grid blocked from the attention block.](architecture.png)

The shape of the network is unusual in two ways worth naming. First, attention runs *per query point* rather than *per ray* or *per image* — there is no temporal or spatial sequence in the usual transformer sense; the "sequence" is purely a small structured neighborhood in feature space. Second, attention is *layer-wise local*: each resolution gets its own attention block, with its own learned weights, operating only on its own neighborhood. Coarse-level attention is plausibly clustering rooms together; fine-level attention is plausibly clustering surface micro-structure together. The hierarchy comes from the hash grid; the attention inherits it.

## From points to pixels <a id="rendering"></a>

A semantic distribution at one 3D point doesn't help a downstream consumer; we need a label for each *pixel*. The bridge is the same volumetric-rendering integral that NeRFs already use for color, applied to semantic distributions:

$$
s(r) \;=\; \sum_{n=1}^N T_n\,\alpha_n\,s'_n,\qquad \alpha_n = 1 - e^{-\sigma_n \delta_n},\qquad T_n = \prod_{k=1}^{n-1}(1 - \alpha_k).
$$

In words: walk along the ray; at every sample point you have a density $\sigma_n$ (how absorbing this region is) and a class distribution $s'_n$ (what this region is); fold them together with the standard alpha-compositing weights. The factor $\alpha_n$ says how much of the ray gets absorbed *at this sample*; the factor $T_n$ says how much of the ray hasn't already been absorbed *before this sample*; their product is each sample's contribution to the final pixel.

<iframe src="volumetric-rendering-semantics.html" height="500"></iframe>

*A side view of a tiny scene with two soft objects. The camera fires a single ray. Each sample point has a density and a class distribution; the strip below the ray shows the per-sample weight w<sub>n</sub> = T<sub>n</sub>·α<sub>n</sub>; the bar on the right shows the composited class distribution at the pixel. The same scene resolves to whichever object the ray actually punches through — slide the pitch and watch the right-hand bar swap.*

The thing that makes this *give multi-view consistency for free* is straightforward: every ray passing through a given 3D region samples the same hash-grid vertices. The semantic answer is determined by the density field and the attention output, both of which are 3D-resident. Two views of the same chair that previously disagreed in 2D now contribute gradients to a single shared answer, and the rendered labels at training poses come back coherent.

## Closing the loop <a id="distillation"></a>

So far we have a 3D field that produces consistent labels at any view. The harder question is whether that consistency can leak *back* into the 2D model that originally fed it.

The mechanism is mundane, and it is exactly what you'd guess. Render the AttentioNGP semantic field at the training poses to obtain a set of consistent pseudo-labels; treat those pseudo-labels as the targets in an ordinary cross-entropy loss; fine-tune the 2D segmenter against them. Nothing about this requires new ground truth — the supervision is the consistent re-rendering of the model's *own* earlier outputs, mediated by the 3D field.

<iframe src="distillation-loop.html" height="500"></iframe>

*The full pipeline. Forward pass: posed RGB → 2D segmenter → noisy per-view labels → AttentioNGP fits these into a 3D-consistent field → re-rendered consistent labels at the training poses. Distillation: cross-entropy fine-tune the 2D segmenter against the consistent labels. The loop closes because the 2D segmenter sees a cleaner version of its own predictions and shifts its weights to match.*

The reason this should work, in principle, is the same as the reason any kind of self-distillation works: the teacher (the AttentioNGP-rendered labels) carries information the student (the raw 2D model) didn't have access to — in this case, multi-view aggregation. As long as the teacher's signal is, on average, more correct than the student's, the student moves toward it.

## What the numbers say <a id="results"></a>

I evaluated on Replica and ScanNet, comparing against [Panoptic Lifting](https://arxiv.org/abs/2212.09802) (the strongest existing semantic lifter at the time). Two metrics matter: mIoU on novel-view semantic segmentation, and PSNR on novel-view RGB synthesis. The latter is the cost we paid by *not* letting semantic gradients into the density field — or, in our case, the saving.

| | Replica mIoU | Replica PSNR | ScanNet mIoU | ScanNet PSNR |
|---|---:|---:|---:|---:|
| Mask2Former (2D, off-the-shelf) | 52.4 | — | 10.2 | — |
| DeepLabV3 (2D, off-the-shelf)   | 28.4 | — | 60.2 | — |
| Panoptic Lifting                | **67.2** | 28.1 | **65.2** | 28.5 |
| AttentioNGP (ours)              | 65.6 | **38.1** | 64.7 | **30.1** |
| Mask2Former (fine-tuned)        | 64.4 | — | 64.5 | — |
| DeepLabV3 (fine-tuned)          | 63.2 | — | 62.1 | — |

Three honest takeaways. We do not beat Panoptic Lifting on mIoU — we land within ~1.5 points on both datasets. We do beat it substantially on PSNR, by ~10 dB on Replica and ~1.5 dB on ScanNet, which reflects the gradient-stop choice. And the fine-tuned 2D segmenters land within a couple of points of the lifter itself on out-of-distribution data — Mask2Former on ScanNet, where it normally collapses to 10 mIoU, comes back at 64. The distillation step, in particular, moved a real amount of 3D-aware capability into the 2D model's weights without seeing any new ground truth.

The qualitative picture matches:

![Side-by-side qualitative comparison on novel views. Bare Mask2Former on ScanNet and bare DeepLabV3 on Replica are noticeably noisy. AttentioNGP's lifted labels are clean and stable. The fine-tuned 2D models, which have to make do without the 3D field at inference, are visibly improved over their out-of-the-box selves. The "no attention" ablation collapses to RGB-quality features for the semantic head — exactly what should happen when you remove the denoising step.](results.png)

The ablations confirm what the architecture predicts. Drop the attention layers entirely and mIoU on Replica falls from 65.6 to 24.4 — the semantic head collapses to whatever embedding the RGB pipeline happened to settle on, which is not very semantic. Allow attention gradients to flow back into the hash grid, and mIoU edges up by a point while PSNR drops by 15 dB. The model we kept sits in the middle of these two extremes by design.

## What didn't work <a id="failures"></a>

The dream — and I think it is genuinely a good one, just not one I was able to deliver — was to drop the underlying 2D segmenter altogether on a novel scene. The architecture, in principle, allows it: the attention layers operate on hash-grid embeddings, which are a property of the scene's *geometry* rather than its semantics, so a freshly-fit AttentioNGP on a brand-new scene should still be able to *cluster* its hash-grid embeddings into semantic groups, even with no 2D model to supervise it. Open-set, no-label semantic discovery, in essence.

It didn't work. I tried a couple of variants — freezing the attention weights from a trained scene and applying them to a new fit, retraining attention with a contrastive objective on geometric similarity — and neither produced anything that held up. My current read is twofold. First, the attention layers ended up specializing to the embedding distribution of the training scene; a new scene's hash-grid embeddings sit somewhere different in feature space, and the attention's learned partitions stop being meaningful. Second, the supervision signal in our setting was always the 2D model's own outputs, so the attention had no incentive to produce structure that wasn't already implicit in those outputs. The attention learned to denoise, not to discover.

The interesting open question is whether either of those failures is fundamental. A contrastive pretraining objective on multi-scene hash-grid embeddings, with explicit normalization before the attention block, would address the first point directly. A supervision signal that *isn't* downstream of the 2D model — clustering against rendered geometry, or against features from a self-supervised vision backbone — would address the second. I never got to try them, and I genuinely don't know how either would land.

## Closing <a id="closing"></a>

The framing I still believe in is that **3D consistency is a property of structure, not of position**. Every existing semantic lifter binds its semantic answer to a coordinate; AttentioNGP binds it to a small neighborhood of hash-grid embeddings. The first move you can make once you decide to do that is the one I made — local self-attention as a soft-clustering primitive over the neighborhood. The second move, which I didn't get to, is to make the clustering portable across scenes. That second move is where I think the interesting work is.

If the algebra and the implementation specifics are useful, [the paper](paper.pdf) has them. The visualizations in this post were written from scratch and are not in the paper; the rest of the figures are.
