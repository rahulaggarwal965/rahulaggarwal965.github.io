---
title: Hello, world
date: 2026-05-02
---

A first post, mostly to confirm that markdown, LaTeX, code, and embedded interactive visualizations all render the way they should.

## Markdown

Standard styling: **bold**, *italic*, `inline code`, [links](https://example.com).

```python
def softmax(x):
    e = (x - x.max()).exp()
    return e / e.sum()
```

> Block quotes look like this.

## LaTeX

Inline math like $f(x) = e^{-x^2}$ renders via KaTeX. Display math:

$$
\int_{-\infty}^{\infty} e^{-x^2}\, dx = \sqrt{\pi}
$$

## Embedded interactive visualization

Drop self-contained HTML into `viz/` and embed with an iframe. Edit the slider to see the curve update.

<iframe src="/viz/example.html" height="320"></iframe>
