"""gilt logo: lowercase "gilt" written as one connected piece with the same flat, horizontal
pen nib as the Mouse 33, Chlorine and Argon logos (W=5.6, T=2.2: thick down strokes, hairline
joins), swept along smooth curves through hand-placed knots and sheared 44 degrees forward.

The g's descender curls left under its bowl and loops back up across the stem into the i,
the way a handwritten g does; the t ends in a flick that rises off the baseline.

Each stroke is a list of knots in upright coordinates (y points down, baseline at the bottom).
The knots are joined by a Catmull-Rom spline written out as cubic Beziers, and a W x T
rectangular nib is swept along it. Strokes overlap at the joins, so the union is one piece
(plus the i's dot)."""
import sys, json
import numpy as np
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
from shapely import affinity

H = 27.0
W_NIB, T_NIB = 5.6, 2.2
A, X, B = 1.1, 10.6, 25.9          # ascender top, x-height, baseline (centrelines)
D = 33.6                           # the swash's line, under the baseline


def bez(p0, p1, p2, p3, n=40):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = map(np.array, (p0, p1, p2, p3))
    return (1-t)**3*p0 + 3*(1-t)**2*t*p1 + 3*(1-t)*t**2*p2 + t**3*p3


def spline(knots, k=1/6):
    """Catmull-Rom through the knots, as a list of cubic Bezier segments."""
    P = [np.array(p, float) for p in knots]
    segs = []
    for i in range(len(P) - 1):
        p1, p2 = P[i], P[i + 1]
        p0 = P[i - 1] if i > 0 else p1 - (p2 - p1)
        p3 = P[i + 2] if i + 2 < len(P) else p2 + (p2 - p1)
        segs.append((p1, p1 + (p2 - p0) * k, p2 - (p3 - p1) * k, p2))
    return segs


def sweep(curves, w=W_NIB, t=T_NIB):
    pts = np.vstack([bez(*c) for c in curves])
    nib = np.array([[-w/2, -t/2], [w/2, -t/2], [w/2, t/2], [-w/2, t/2]])
    return unary_union([Polygon(np.vstack([nib + a, nib + b])).convex_hull for a, b in zip(pts[:-1], pts[1:])])


def to_path(g, nd=2):
    out = []
    for p in (g.geoms if isinstance(g, MultiPolygon) else [g]):
        for ring in [p.exterior, *p.interiors]:
            c = list(ring.coords)[:-1]
            out.append("M" + " L".join(f"{x:.{nd}f},{y:.{nd}f}" for x, y in c) + "Z")
    return "".join(out)


def g_bowl():
    # round counter-clockwise from the top join, closing back up into the stem
    return [(9.0, X), (5.6, 11.2), (2.8, 15.8), (2.2, 21.8), (4.4, 25.6), (7.8, 24.8), (10.4, 20.0),
            (11.6, 14.0), (12.0, X)]


def g_loop(out=(20.4, X)):
    """down the stem, curling LEFT under the bowl (what makes it a g, not a q), then back up
    across the stem near the baseline and on into the next letter"""
    return [(12.0, X), (11.8, 17.0), (11.4, 24.0), (10.6, 29.8), (8.6, D), (5.0, D + 0.6),
            (2.4, D - 1.2), (3.2, 30.6), (7.4, 28.2), (12.6, 26.4), (16.0, 25.4), (18.8, 20.6), out]


def strokes():
    S = [g_bowl(), g_loop()]
    # i stem, hooking out and climbing into the l's loop, down the l, and up into the t
    S.append([(20.4, X), (20.0, 17.0), (19.8, 23.4), (21.4, 25.8), (24.0, 24.6), (26.4, 18.6),
              (29.4, 9.2), (31.2, 3.6), (30.0, A), (27.6, 2.8), (26.2, 11.2), (25.6, 19.6),
              (26.2, 24.8), (28.6, 25.8), (31.6, 22.8), (34.2, 15.4), (36.0, 4.6)])
    # t stem, with a flick that rises off the baseline
    S.append([(36.0, 4.6), (35.4, 12.0), (34.8, 20.4), (35.6, 25.4), (38.4, 25.8), (41.6, 22.0)])
    # t crossbar
    S.append([(31.6, X - 0.2), (36.0, X - 0.4), (41.2, X - 1.0)])
    return S


def dot():
    """The i's tittle: a short nib stroke."""
    return [(20.0, 5.6), (20.5, 3.6)]


def build(skew=44.0, mark_only=False, sx=1.55):
    if mark_only:  # the g on its own, for the app icon and favicon
        S = [g_bowl(), g_loop(out=(17.0, 23.6))]
    else:
        S = strokes() + [dot()]
    S = [[(x * sx, y) for x, y in s] for s in S]
    g = unary_union([sweep(spline(s)) for s in S])
    g = affinity.skew(g, xs=-skew, origin=(0, H)).simplify(0.035)
    minx, miny, maxx, maxy = g.bounds
    g = affinity.translate(g, -minx, -miny)
    return g, (maxx - minx, maxy - miny)


def parts(g):
    return len(g.geoms) if isinstance(g, MultiPolygon) else 1


if __name__ == "__main__":
    g, (w, h) = build()
    print(json.dumps({"w": round(w, 2), "h": round(h, 2), "parts": parts(g)}))
