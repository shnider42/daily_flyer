"""Shared odd-row hex geometry for DSL and Empires; no game rules or state."""
from functools import lru_cache

def cube(pos):
    x, y = pos
    q = x - (y - (y & 1)) // 2
    return (q, -q-y, y)


def distance(a, b):
    ax, ay = a; bx, by = b
    dq = ax - (ay - (ay & 1)) // 2 - bx + (by - (by & 1)) // 2
    dy = ay - by
    return max(abs(dq), abs(dy), abs(dq+dy))


@lru_cache(maxsize=16384)
def line_cells(a, b):
    """Immutable geometry only; blockers are checked against live state below."""
    n = distance(a, b)
    ac, bc = cube(a), cube(b)
    cells = []
    for i in range(1, n):
        # Consistent tiny nudge resolves lines exactly on hex edges.
        p = [ac[j] + (bc[j]-ac[j])*i/n + (1e-6 if j < 2 else -2e-6) for j in range(3)]
        r = [round(v) for v in p]
        k = max(range(3), key=lambda j: abs(r[j]-p[j]))
        r[k] = -sum(r[j] for j in range(3) if j != k)
        y = r[2]
        x = r[0] + (y-(y & 1))//2
        cells.append((x,y))
    return tuple(cells)



def neighbors(pos, width, height):
    x,y=pos
    for dx,dy in ((-1,0),(1,0),(-1+(y&1),-1),(y&1,-1),(-1+(y&1),1),(y&1,1)):
        p=(x+dx,y+dy)
        if 0<=p[0]<width and 0<=p[1]<height:
            yield p
