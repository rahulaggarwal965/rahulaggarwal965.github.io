---
title: Lie Groups and Smooth Manifolds for Robotic State Estimation
date: 2022-11-18
---

*This post is a (hopefully) intuitive walkthrough of [the explanatory paper](paper.pdf) I wrote back in 2022. I expose you to the same math, but lean on visuals and analogies to get my points across.*

Robots, in order to act coherently in the world, must maintain an internally consistent notion of where they are with respect to their environment. A naive approach would be to leverage the basic capabilities of the robot: read its velocity, multiply by the time elapsed, and add the result to our previous position. Unfortunately, we quickly discover that the trajectory we produce does not match the one our robot actually drives. Our fundamental approach is wrong.

To fix this, we will need to motivate the machinery that underlies state estimation, SLAM, and pose-graph optimization — components extremely prevalent in modern robotics systems. Specifically, we build from the failure of our naive approach to the latent structure that fixes it: smooth manifolds, their tangent spaces, and the special class of manifolds that are also groups (*Lie groups*).

Crucially, we will eventually construct a method to perform nonlinear least squares on curved spaces like $SO(3)$, enabling us to perform the kind of optimization a modern robot leverages to fuse its sensors (IMU, wheel odometry, camera information) into a single confident state estimate.

<div class="aside" markdown="1">
<span class="aside-label">Prerequisites</span>
We assume comfort with multivariable calculus — gradients, Jacobians, the derivative as a best linear approximation — together with a working knowledge of linear algebra (matrices, change of basis). No topology or differential geometry is assumed; we will build up everything we need as we go.
</div>

## The naive update is wrong

Consider a robot on the floor whose motion is described by three numbers: forward velocity $v_x$, lateral velocity $v_y$, and turning rate $\omega$. Suppose we update its state using the rule

$$
(x_{t+1},\ y_{t+1},\ \theta_{t+1}) \;=\; (x_t + v_x\,\Delta t,\ \ y_t + v_y\,\Delta t,\ \ \theta_t + \omega\,\Delta t).
$$

Even with infinitely fine time-steps and perfectly noise-free sensors, this approach fails: our calculated trajectory inevitably drifts away from the path the robot actually drives.

The cause is a coordinate-frame mismatch. The pair $(v_x, v_y)$ is a *body-frame* velocity — "forward" and "left" relative to wherever the robot is currently pointing. As $\theta$ changes, "forward" rotates with it. The naive update ignores this entirely, applying the body-frame velocity as if it were fixed in the world while separately accumulating the heading change. The position update and the orientation update are inconsistent.

<iframe src="se2-integration.html" height="440"></iframe>

The visualization makes the divergence concrete. With $\omega$ near zero, the two integrators agree, and both trace a straight line. As $\omega$ grows, the naive integrator continues straight while spinning the robot in place — a path no real wheeled vehicle ever follows. The right-hand integrator, applying the same twist correctly, traces a clean circular arc.

The fix is to bundle the orientation $R(\theta)$ and the position $(x, y)$ into a single object — a *rigid transformation* — and to ask: what is the correct way to advance through the space of rigid transformations given a constant velocity?

That space is called $SE(2)$. It forms a group, since rigid transformations compose, and it is also a smooth surface in a sense we will make precise. The right notion of "advance" through it is the **matrix exponential**, an object that will reappear in every subsequent section. To get there cleanly, we first need the underlying machinery: smooth manifolds, tangent spaces, and Lie groups.

## Smooth manifolds

Before we can do anything else, we need a precise notion of what it means for a space to "look Euclidean up close." We will start with the rough geometric idea, then make it formal.

Consider the surface of a sphere — its surface, not its solid interior. Globally, the sphere is curved, and there is no faithful map from the entire sphere onto a flat plane; this is why every world map must distort *something*, whether area, angle, or shape. Yet a coin-sized patch of that same surface can be projected onto a plane with arbitrarily little distortion. The local geometry is essentially flat, even when the global geometry is not.

A *smooth manifold* is the abstraction of this property: a space in which every point sits inside some neighborhood that can be flattened onto a region of $\mathbb{R}^n$. The flattening maps are called **charts**, and the collection of charts that together cover the entire space is the **atlas**.

<div class="formal" markdown="1">
<span class="formal-label">Definition — locally Euclidean</span>
A topological space $X$ is *locally Euclidean of dimension $n$* if for every $p \in X$ there is an open neighborhood $U \subseteq X$ and a homeomorphism

$$
\varphi \;:\; U \;\longrightarrow\; \varphi(U) \subseteq \mathbb{R}^n.
$$

The pair $(U, \varphi)$ is a **coordinate chart**. A collection $\{(U_i, \varphi_i)\}$ whose $U_i$ cover $X$ is an **atlas**.
</div>

Charts are the means by which we do calculus on a manifold. Given a function $f : X \to \mathbb{R}$, its representation through a chart $(U, \varphi)$ is the composition

$$
f \circ \varphi^{-1} \;:\; \mathbb{R}^n \;\longrightarrow\; \mathbb{R},
$$

a function on flat space, where ordinary multivariable calculus applies directly.

For this trick to behave consistently when two charts overlap, the composition relating them must itself be smooth in the calculus sense. A topological manifold equipped with such an atlas is a **smooth manifold**.

<div class="formal" markdown="1">
<span class="formal-label">Definition — smooth manifold</span>
A *smooth manifold* is a topological manifold $X$ together with an atlas whose **transition maps**

$$
\varphi_{ij} \;\triangleq\; \varphi_i \circ \varphi_j^{-1} \;:\; \varphi_j(U_i \cap U_j) \;\longrightarrow\; \varphi_i(U_i \cap U_j)
$$

are smooth diffeomorphisms wherever defined.
</div>

The smoothness condition rules out manifolds with creases or kinks; it ensures that "differentiable" means the same thing across every chart.

<iframe src="sphere-chart.html" height="500"></iframe>

The figure shows one chart on the unit sphere: the orthogonal projection of a spherical cap onto the tangent plane at its center. On the left is the sphere with the patch highlighted; on the right is the resulting chart $\varphi(U) \subset \mathbb{R}^2$. Drag the sphere to slide the chart center to a different location, and shrink $\alpha$ to make the patch smaller.

Two observations are worth noting. First, the latitude and longitude lines, which appear as great circles on the sphere, are visibly curved when projected — the projection is not an isometry, and distances and angles are distorted. Second, as $\alpha$ shrinks, that distortion shrinks with it; in the limit $\alpha \to 0$, the projected grid becomes indistinguishable from the rectangular grid of $\mathbb{R}^2$. This is what *locally Euclidean* means in pictures: every manifold looks flat at every point, provided one looks closely enough.

<details markdown="1"><summary>The technical conditions we glossed over</summary>
Locally Euclidean is necessary but not quite sufficient to be a topological manifold. We also require $X$ to be Hausdorff (distinct points have disjoint neighborhoods) and second countable (its topology has a countable basis). These conditions rule out pathological spaces — for example, the line with a doubled origin, where calculus would not behave as expected. They are automatic for the spaces robotics cares about.

The smoothness condition is also stronger than it sounds. Two atlases on the same topological manifold can give *incompatible* smooth structures, so a smooth manifold is a topological manifold *together with* a choice of smooth atlas. For Lie groups this turns out not to matter — the group operation forces a unique smooth structure.
</details>

## Tangent spaces

With manifolds in hand, we turn to a notion of *direction*: vectors that point along the manifold rather than off into the space surrounding it. This is the **tangent space**, and the path from ordinary calculus to its manifold version is short.

In single-variable calculus, the derivative $f'(x)$ gives the slope of the tangent line — the best linear approximation of $f$ at the point $x$. In multivariable calculus, the derivative of $f : \mathbb{R}^n \to \mathbb{R}^m$ at $x$ generalizes to a linear map $df_x : \mathbb{R}^n \to \mathbb{R}^m$ characterized by

$$
f(x + h) \;=\; f(x) \;+\; df_x(h) \;+\; o(|h|), \qquad h \to 0.
$$

The **Jacobian** is the matrix representation of $df_x$ in the standard basis. When $n = 2$ and $m = 1$, the graph of $df_x$ is the tangent plane to the surface $z = f(x, y)$.

On a manifold we want the same idea, but the domain is now curved. The fix is to work through charts: pull a neighborhood of $p$ back to $\mathbb{R}^n$ via a local parameterization, perform calculus there, and identify the result with something on the manifold itself. A particularly clean way to see what comes out is via curves. Every smooth curve $\gamma : (-\varepsilon, \varepsilon) \to X$ with $\gamma(0) = p$ has a velocity at $p$, and the collection of all such velocities is precisely the tangent space at $p$.

<div class="formal" markdown="1">
<span class="formal-label">Definition — tangent space</span>
The **tangent space** at $p$, written $T_p X$, is the set of velocities of smooth curves through $p$:

$$
T_p X \;\triangleq\; \bigl\{\, \gamma'(0) \;:\; \gamma \text{ a smooth curve in } X \text{ with } \gamma(0) = p \,\bigr\}.
$$

Equivalently, given any chart $\varphi : U \to \mathbb{R}^n$ at $p$, $T_p X$ is the image of $d\varphi^{-1}_{\varphi(p)}$, and the image is independent of which chart we pick.
</div>

For a sphere $S^2 \subset \mathbb{R}^3$, this story has a familiar geometric realization: $T_p S^2$ is the plane tangent to the sphere at $p$, sitting as a 2D linear subspace of $\mathbb{R}^3$.

<iframe src="tangent-plane.html" height="500"></iframe>

The figure shows $T_p S^2$ at a draggable point. Click and drag $p$ across the visible hemisphere, and the tangent plane rotates to remain tangent. The two arrows form an orthonormal basis $\{e_1, e_2\}$ of $T_p S^2$, and every tangent vector at $p$ is a real linear combination of these two basis vectors.

<div class="formal" markdown="1">
<span class="formal-label">Remark — local coordinates</span>
$T_p X$ is a vector space of dimension $n$. Once we fix a chart at $p$ — equivalently, a basis $\{e_1, \dots, e_n\} \subset T_p X$ — every tangent vector becomes an $n$-tuple of real numbers, its **local coordinates**. Calculus on $X$, expressed in local coordinates, reduces to ordinary multivariable calculus. This reduction is the entire reason we built this machinery.
</div>

## Lie groups

So far we have considered manifolds in their full generality. Some manifolds, however, carry an additional structure that proves enormously useful: they are also groups, and their multiplication and inverse maps are smooth. Such manifolds are called **Lie groups**.

The intuition behind a Lie group is *continuous symmetry*. Consider two contrasting examples. The symmetries of a square are discrete — a finite list of flips and 90° rotations, easily enumerated. The symmetries of a circle, by contrast, are continuous: the circle looks the same after any rotation, no matter how small. Lie groups are the language in which we describe transformations that vary smoothly, and every group of geometric transformations relevant to robotics — rotations and rigid motions in particular — is a Lie group.

<div class="formal" markdown="1">
<span class="formal-label">Definition — Lie group</span>
A *Lie group* is a smooth manifold $G$ that is also a group, with the multiplication $(g, h) \mapsto gh$ and the inverse $g \mapsto g^{-1}$ both being smooth maps.
</div>

The simplest examples come from rotations and rigid transformations:

- $SO(2)$ — 2D rotations, geometrically the unit circle.
- $SO(3)$ — 3D rotations.
- $SE(2)$ — 2D rigid transformations (rotation plus translation).
- $SE(3)$ — 3D rigid transformations.

Each of these is a **matrix Lie group**: its elements are matrices, group multiplication is matrix multiplication, and the group inverse is the matrix inverse. They all live inside $GL(n, \mathbb{R})$, the group of invertible $n \times n$ real matrices.

### The Lie algebra: the velocity space of the group

A Lie group is curved, and curved spaces are awkward for calculus — gradients, linear approximations, and optimization all want a flat domain. To work around this, we do not operate on the group directly. Instead, we work on a vector space attached to it: the **Lie algebra** $\mathfrak{g}$.

Here is the analogy that makes the role of the Lie algebra clear. If $G$ is the set of *positions* a system can occupy (rotations, poses, transformations), then $\mathfrak{g}$ is the corresponding set of *velocities* — the rates at which the system can change its position, measured at the identity. For $SO(3)$, the algebra $\mathfrak{so}(3) \cong \mathbb{R}^3$ collects the angular velocities, one number for the rate of spin around each axis. For $SE(2)$, $\mathfrak{se}(2) \cong \mathbb{R}^3$ collects the velocity twists $(v_x, v_y, \omega)$ — the very same triple we slid around in the first figure, describing how a body translates and rotates instantaneously.

Velocities are easy to manipulate: they form a vector space, and we can add them, scale them, and take linear combinations freely. The corresponding *positions*, in general, do not have this property — adding two rotation matrices, for instance, does not produce a rotation matrix. This asymmetry is precisely what we will exploit.

<div class="formal" markdown="1">
<span class="formal-label">Definition — Lie algebra</span>
For a Lie group $G$ with identity $e$, the **Lie algebra** is the tangent space at the identity:

$$
\mathfrak{g} \;\triangleq\; T_e G.
$$

For matrix Lie groups, $\mathfrak{g}$ is a vector subspace of the $n \times n$ matrices.
</div>

Concretely: $\mathfrak{so}(n)$ is the space of skew-symmetric $n \times n$ matrices, and $\mathfrak{se}(n)$ is parameterized by velocity twists. Both make immediate sense as "instantaneous motions" — angular velocities for $\mathfrak{so}(3)$, twists for $\mathfrak{se}(2)$.

### From velocity to position: the exponential map

We have velocities ($\mathfrak{g}$) and we want positions ($G$). The bridge between them is the **exponential map** $\exp : \mathfrak{g} \to G$.

The intuition is the same one that gives continuously compounded interest. If money grows at rate $r$, then after time $t$ we have a factor of $e^{rt}$, computed as the limit of "multiply by $1 + rt/n$, then repeat $n$ times" as $n \to \infty$. Each tiny step is approximately right; the limit is exactly right. For a Lie group the construction is identical, with the rate now a matrix and multiplication now matrix multiplication. We apply a tiny perturbation $I + A/n$ many times — at each step taking a small step in the direction of $A$ — and as $n \to \infty$ we arrive at a true element of $G$:

$$
\exp(A) \;=\; \sum_{k=0}^\infty \frac{A^k}{k!} \;=\; \lim_{n \to \infty}\!\left(I + \frac{A}{n}\right)^{\!n}.
$$

The naive integrator from the opening is exactly what one obtains by stopping this limit early — by taking a single step rather than $n$ of them. Setting $\exp(A) \approx I + A$ keeps only the first two terms of the series, and the resulting trajectory leaves the group because $I + A$ is at best an approximation of an actual group element, not the real thing.

The exp map is generally **many-to-one**: distinct elements of the algebra can map to the same group element. The cleanest example of this is $SO(2)$, where the picture is the picture of angles wrapping.

<iframe src="exp-so2.html" height="540"></iframe>

The Lie algebra $\mathfrak{so}(2) \cong \mathbb{R}$ is a real line, comprising scalar multiples of the skew-symmetric generator $J = \begin{pmatrix}0 & -1 \\ 1 & 0\end{pmatrix}$. The exponential map sends $\omega \in \mathfrak{so}(2)$ to the rotation matrix

$$
R(\omega) \;=\; \exp(\omega J) \;=\; \begin{pmatrix} \cos\omega & -\sin\omega \\ \sin\omega & \phantom{-}\cos\omega \end{pmatrix}.
$$

Slide $\omega$ in the figure: rotations by $0$, $2\pi$, $4\pi$ all leave the system facing the same direction, so $\omega$ and $\omega + 2\pi$ in the algebra map to the same rotation in the group. The infinite straight line of the algebra wraps around the finite circle of the group, infinitely many times. The slider for $n$ shows the limit definition concretely: at $n = 1$, the polyline $(I + \omega J/n)^k \cdot e_1$ for $k = 0, \dots, n$ is a single line segment far from the circle; as $n$ grows, the polyline straightens onto the arc and converges to the true rotation.

This many-to-one behavior is a feature, not a flaw. The algebra is the *infinitesimal* description; the group is the global one. They agree in a neighborhood of the identity, and they diverge globally because the group can be topologically nontrivial — closed up like a circle, or like a sphere modulo antipodes in the case of $SO(3)$.

### Twists and the hat operator

Vectors in a matrix Lie algebra have two natural representations: as $n$-tuples of real numbers (their coordinates) and as $n \times n$ matrices. The **hat operator** $\widehat{\,}$ converts the former into the latter.

The most important case for our purposes is $\mathfrak{se}(2)$. The 2D twist $\xi = (v_x, v_y, \omega)$ — the same triple we slid around at the very beginning — corresponds to the matrix

$$
\hat\xi \;=\; \begin{pmatrix} 0 & -\omega & v_x \\ \omega & \phantom{-}0 & v_y \\ 0 & \phantom{-}0 & 0 \end{pmatrix} \;\in\; \mathfrak{se}(2).
$$

The "correct" SE(2) integrator from that figure is, in this new language, simply the matrix exponential of the twist:

$$
T(t) \;=\; \exp(t\, \hat\xi).
$$

The opening figure thus had a Lie-theoretic reading all along. The triple $(v_x, v_y, \omega)$ is a velocity in $\mathfrak{se}(2)$, and the pose $T(t)$ is its exponential.

### The tangent space at the identity is the Lie algebra

We have taken $\mathfrak{g} = T_e G$ as the definition and used the identification freely. It is worth a brief sanity check that nothing is hidden in this definition: any infinitesimal motion in $G$ from the identity should be captured by an element of $\mathfrak{g}$, with no missing or spurious directions.

<div class="formal" markdown="1">
<span class="formal-label">Theorem</span>
Let $G \subset GL(n, \mathbb{R})$ be a matrix Lie group and $\gamma : (-\varepsilon, \varepsilon) \to G$ a smooth curve with $\gamma(0) = I$. Then $\gamma'(0) \in \mathfrak{g}$.
</div>

<details markdown="1"><summary>Proof sketch</summary>
For sufficiently small $s$, the matrix logarithm is well defined and lands in the algebra: $\log \gamma(s) \in \mathfrak{g}$. Therefore

$$
\frac{d}{ds}\log \gamma(s)\bigg|_{s=0} \;=\; \lim_{\varepsilon \to 0}\frac{\log \gamma(\varepsilon)}{\varepsilon} \;\in\; \mathfrak{g},
$$

since $\mathfrak{g}$ is a closed subspace and the limit of elements of $\mathfrak{g}$ stays in $\mathfrak{g}$.

Now expand the matrix log as a series:

$$
\log \gamma(s) \;=\; (\gamma(s) - I) \;-\; \tfrac{1}{2}(\gamma(s) - I)^2 \;+\; \tfrac{1}{3}(\gamma(s) - I)^3 \;-\; \cdots
$$

Differentiating term by term and evaluating at $s = 0$, the $k$th term has a derivative proportional to $(\gamma(s) - I)^{k-1}\,\gamma'(s)$, which vanishes at $s = 0$ for $k \geq 2$ since $\gamma(0) = I$. Only the first term survives:

$$
\frac{d}{ds}\log \gamma(s)\bigg|_{s=0} \;=\; \gamma'(0).
$$

Combined with the previous display, $\gamma'(0) \in \mathfrak{g}$. $\blacksquare$
</details>

The corollary we will use repeatedly is this: a tangent vector at any group element $a$ can be written $a\hat\xi$ for some $\xi \in \mathbb{R}^n$. Multiplying the algebra at the identity by $a$ produces the tangent space at $a$, and calculus on the entire curved group thereby reduces to calculus on a single flat vector space, slid along the group as needed.

## Optimization on manifolds

We are finally ready to state — and solve — the problem a robot actually wants to solve.

A robot collects noisy sensor measurements $z$ from a nonlinear function of its state, and it wants the state that best explains those measurements. For an orientation $R \in SO(3)$, the problem is

$$
R^* \;=\; \underset{R \in SO(3)}{\arg\min} \;\|h(R) - z\|^2_\Sigma,
$$

where $\|e\|^2_\Sigma \triangleq e^T \Sigma^{-1} e$ is the **Mahalanobis distance** with covariance $\Sigma$.

This is **nonlinear least squares**. The same formulation underlies bundle adjustment, pose-graph SLAM, and IMU preintegration — anywhere noisy measurements must be fused into a coherent state estimate. The wrinkle, of course, is that the state $R$ lives on a curved manifold.

<div class="aside" markdown="1">
<span class="aside-label">Why not Euler angles?</span>
A natural reflex is to parameterize $SO(3)$ with three Euler angles (roll, pitch, yaw) and run ordinary multivariable optimization on those. There are two reasons not to. First, Euler angles suffer from **gimbal lock**: at certain orientations, two of the three angles coincide and we lose a degree of freedom — the Jacobian becomes rank-deficient and the optimizer stalls. Second, more fundamentally, $SO(3)$ is topologically nontrivial, and no three-parameter chart can cover it without a singularity somewhere. The fix is to optimize on the manifold itself, working in local coordinates only when we need to take a step.
</div>

The recipe we will construct has three pieces:

1. A way to take a small step on the manifold — a **retraction**.
2. A way to linearize $h$ around the current estimate.
3. A standard linear least-squares solve in tangent coordinates.

### The retraction operator

To take a step at a point $a \in G$, we use the exponential map:

$$
a \oplus \xi \;\triangleq\; a\,\exp(\hat\xi).
$$

Here $\xi \in \mathbb{R}^n$ are the local coordinates of the step. For small $\xi$, the map $\xi \mapsto a \oplus \xi$ is a chart at $a$ — a flat parameterization of a neighborhood on $G$, with the chart origin coinciding with $a$ itself.

This is the operation that makes manifold optimization possible. Adding two rotations is meaningless ($R_1 + R_2$ is not a rotation), but adding a tangent vector $\xi$ to a base point $a$ via $a \oplus \xi$ is well-defined and stays on the manifold.

### Linearization on the manifold

With a chart in hand, we can ask what it means for $h : G \to \mathbb{R}^m$ to be differentiable at $a$. The answer is the same as in flat space, with the operator $\oplus$ in place of ordinary addition.

<div class="formal" markdown="1">
<span class="formal-label">Definition — derivative on a Lie group</span>
$h : G \to \mathbb{R}^m$ is *differentiable* at $a \in G$ if there exists a matrix $H_a \in \mathbb{R}^{m \times n}$ such that

$$
\lim_{\xi \to 0}\;\frac{\bigl|\, h(a \oplus \xi) - h(a) - H_a \xi \,\bigr|}{|\xi|} \;=\; 0.
$$

The matrix $H_a$ is the **Jacobian** of $h$ at $a$.
</div>

In words, there is a linear map $H_a$ such that $h(a \oplus \xi) \approx h(a) + H_a \xi$ for small $\xi$. This is precisely the multivariable Jacobian, computed in the chart $\xi \mapsto a \oplus \xi$.

### Gauss-Newton on a manifold

We can now assemble the algorithm. Starting from an estimate $a_k \in G$, each iteration proceeds in three steps.

**Linearize.** Approximate $h$ by its first-order Taylor expansion in local coordinates:

$$
h(a_k \oplus \xi) \;\approx\; h(a_k) + H_{a_k}\,\xi.
$$

**Solve** the resulting linear least-squares problem for the local-coordinate update:

$$
\xi^* \;=\; \underset{\xi \in \mathbb{R}^n}{\arg\min}\;\bigl\|\, h(a_k) + H_{a_k}\,\xi - z \,\bigr\|^2_\Sigma.
$$

Setting the gradient to zero yields the **normal equations**:

$$
H_{a_k}^T \Sigma^{-1} H_{a_k}\,\xi^* \;=\; H_{a_k}^T \Sigma^{-1}\bigl(z - h(a_k)\bigr).
$$

This is a 3×3 linear system for $SE(2)$ pose estimation, a 6×6 system for $SE(3)$, and so on.

**Retract.** Map the local-coordinate solution back to a group element:

$$
a_{k+1} \;=\; a_k \oplus \xi^*.
$$

We repeat until $\xi^*$ is sufficiently small. That is the entire algorithm.

### A concrete example

Consider a robot at unknown pose $T \in SE(2)$ that measures a set of landmarks. Each measurement $b_j \in \mathbb{R}^2$ is the noisy body-frame position of a landmark $L_j \in \mathbb{R}^2$ at known world-frame position:

$$
b_j \;=\; T^{-1} L_j \;+\; \epsilon_j.
$$

We want the pose $T$ for which the predicted landmark positions $T b_j$ match the known $L_j$. The cost is

$$
f(T) \;=\; \tfrac{1}{2} \sum_j \bigl\|T b_j - L_j\bigr\|^2.
$$

<iframe src="gauss-newton.html" height="540"></iframe>

The figure shows Gauss-Newton iterating on this problem. Filled dots are the landmarks, open circles are the predicted landmark positions $T b_j$ under the current estimate, and gray lines connect each prediction to its target — the residuals. The **Step** button advances one Gauss-Newton iteration, **Run to convergence** runs until the cost stops decreasing, and **New random initial guess** picks a fresh starting pose, often a few units and radians from the truth.

Several aspects of the iteration are worth noting. Convergence is fast: even from a guess far from the truth, the cost drops by orders of magnitude in four to six iterations. Once the estimate enters a basin around the optimum, Gauss-Newton converges *quadratically*, with the number of correct digits roughly doubling per step. The retraction is doing real work along the way: each iteration solves a 3-parameter linear system (since $\dim \mathfrak{se}(2) = 3$), then maps the resulting $\xi^* \in \mathbb{R}^3$ back to a pose via $T \cdot \exp(\hat\xi^*)$. Without the exponential, a naive update of the rotation would push us off the manifold — exactly the failure mode of the section-1 integrator.

A bad initial guess can converge to a different local minimum. The cost surface for nonlinear least squares is generally nonconvex, and the algorithm only guarantees a stationary point near the initial guess. For real-world problems like SLAM, this is handled either through careful initialization or with Levenberg-Marquardt, a damped variant that interpolates between Gauss-Newton and gradient descent.

## Group actions and their derivatives

We have one final piece left to assemble — the piece that actually appears in the Jacobian we feed to Gauss-Newton.

So far we have treated $h(T)$ as an abstract measurement function. In practice, $h$ almost always involves *applying* the group element $T$ to a point in space. A robot computes a landmark's body-frame position by passing the world-frame landmark $L$ through its inverse pose, $h(T, L) = T^{-1} L$. A camera projects a world point onto its image plane via $h(T, L) = \pi(T L)$. Both expressions are *actions* of the Lie group on a space of points, and to take a Gauss-Newton step we need the Jacobian of the action.

Group actions are worth naming carefully.

<div class="formal" markdown="1">
<span class="formal-label">Definition — group action</span>
A (left) **action** of a Lie group $G$ on a space $X$ is a smooth map

$$
f \,:\, G \times X \to X,
$$

compatible with the group structure: $f(e, x) = x$, and $f(gh, x) = f(g, f(h, x))$.
</div>

The case we care about is matrix-vector multiplication, $f(T, p) = Tp$, with $T$ in a matrix Lie group and $p \in \mathbb{R}^n$. The two compatibility conditions translate to "the identity does nothing" and "applying $gh$ is the same as applying $h$ then $g$" — the everyday properties of matrix multiplication.

### The derivative of an action

Since $f(T, p) = Tp$ has two arguments, its derivative naturally splits into two parts: how $Tp$ changes when we wiggle $T$ (with $p$ held fixed) and how it changes when we wiggle $p$ (with $T$ held fixed).

Wiggling $p$ is straightforward:

$$
f(T, p + \delta p) \;=\; T(p + \delta p) \;=\; Tp + T\,\delta p,
$$

so $\partial f / \partial p = T$.

Wiggling $T$ uses the retraction we just defined. For small $\xi$,

$$
T \exp(\hat\xi)\,p \;\approx\; T(I + \hat\xi)\,p \;=\; Tp + T\hat\xi\,p,
$$

so the velocity of $Tp$ under the perturbation $\xi$ is $T\hat\xi p$.

A useful piece of bookkeeping follows. The expression $\hat\xi p$ is *linear in $\xi$*, since each of the $n$ entries of $\xi$ scales a generator $G^i$ which in turn acts linearly on $p$. We can therefore rewrite

$$
\hat\xi\, p \;=\; H(p)\,\xi,
$$

where $H(p)$ is an $n \times \dim\mathfrak{g}$ matrix that depends only on $p$, with columns $G^i p$.

<div class="formal" markdown="1">
<span class="formal-label">Theorem — Jacobian of the group action</span>
The Jacobian of $f(T, p) = Tp$ at $(T, p)$ is

$$
F_{(T, p)} \;=\; \begin{bmatrix} T H(p) & T \end{bmatrix} \;=\; T \begin{bmatrix} H(p) & I_n \end{bmatrix}.
$$

The first block gives the derivative with respect to $T$; the second gives the derivative with respect to $p$.
</div>

### The cross-product formula for SO(3)

For the case most relevant to robotics, $H(p)$ takes a particularly clean form. The Lie algebra generators of $SO(3)$ are the three skew-symmetric basis matrices

$$
G^1 = \begin{pmatrix} 0 & 0 & 0 \\ 0 & 0 & -1 \\ 0 & 1 & 0 \end{pmatrix},\quad
G^2 = \begin{pmatrix} 0 & 0 & 1 \\ 0 & 0 & 0 \\ -1 & 0 & 0 \end{pmatrix},\quad
G^3 = \begin{pmatrix} 0 & -1 & 0 \\ 1 & 0 & 0 \\ 0 & 0 & 0 \end{pmatrix},
$$

so that for an angular velocity $\omega = (\omega_1, \omega_2, \omega_3)$,

$$
\hat\omega \;=\; \omega_1 G^1 + \omega_2 G^2 + \omega_3 G^3 \;=\; [\omega]_\times,
$$

the familiar skew-symmetric cross-product matrix. Computing $H(p) = [G^1 p \mid G^2 p \mid G^3 p]$ then gives

$$
H(p) \;=\; \begin{pmatrix} 0 & p^3 & -p^2 \\ -p^3 & 0 & p^1 \\ p^2 & -p^1 & 0 \end{pmatrix} \;=\; [-p]_\times,
$$

so the Jacobian of $f(R, p) = Rp$ with respect to a rotation perturbation is simply

$$
F_{(R, p)} \;=\; R\,[-p]_\times.
$$

This is the formula every visual-SLAM and IMU-preintegration codebase has somewhere.

<iframe src="rotation-velocity-field.html" height="540"></iframe>

Geometrically, this is precisely the velocity field of a rigid body rotating about the origin. Each point $p$ has velocity $\hat\omega p = \omega \times p$, perpendicular to $p$ and proportional to $|p|$. Slide $\omega$ to scale and reverse the field; drag to highlight a single point and see its position vector and velocity drawn explicitly. The two are perpendicular at every point, for every value of $\omega$.

The same formula tells us both how a real rotating body moves *and* how a Gauss-Newton step should perturb its estimated rotation. Rigid-body kinematics, recovered as a Jacobian.

## Closing

We began with a robot that integrated its velocity poorly because the integration ignored the curvature of $SE(2)$. We end with a recipe — linearize, solve, retract — that handles every nonlinear least-squares problem on every Lie group a robot ever encounters. Smooth manifolds gave us a precise notion of "looks Euclidean up close." Tangent spaces gave us directions on those manifolds. Lie groups gave us the special manifolds that are also groups, with a Lie algebra at the identity that doubles as a velocity space and a flat coordinate system. The exponential map carried velocities to positions. The retraction $a \oplus \xi = a \exp(\hat\xi)$ turned that map into a chart at any point, which was enough to define a manifold-valued Jacobian and, with it, Gauss-Newton.

In production this machinery lives behind names like Ceres, GTSAM, and g²o — solvers that take a residual function and a manifold type and run the algorithm in this post on graphs of millions of variables, fast. The paper this post is based on goes deeper into the matrix machinery and the variational interpretations. If any of this was new and you would like the rigorous version, [start there](paper.pdf).
