// Low-poly player silhouettes for the Canvas renderer's distant aircraft pass.
// Hulls use [centre X, centre Y, tail Z, nose Z, half width, half height].
// Wings and stabilizers use [X, Y, Z] planform points, from the root forward.
const airframes = {
  p38: {
    hulls: [[0,.13,-3.7,5.1,.68,.77],[2.73,.08,-5.74,4.65,.68,.76]],
    wing: [[.38,-.19,1.45],[2.73,-.14,1.27],[7.91,.55,-.4],[6.2,.30,-.94],[.38,-.19,-1.76]],
    tail: [[0,.29,-4.03],[2.76,.29,-4.15],[2.76,.29,-5.48],[0,.29,-5.45]],
    fin: [[2.73,.20,-3.82],[2.73,1.91,-4.85],[2.73,1.2,-5.67],[2.73,.20,-5.74]],
  },
  mig21: {
    hulls: [[0,.05,-7.36,6.65,.78,.78]],
    wing: [[.52,-.28,2.15],[3.575,-.13,-3.01],[3.575,-.13,-3.55],[.52,-.28,-3.39]],
    tail: [[.32,.07,-4.65],[2.18,.04,-6.11],[2.18,.04,-6.99],[.32,.07,-6.56]],
    fin: [[0,.62,-2.1],[0,3.41,-4.9],[0,3.05,-5.8],[0,.63,-6.56]],
  },
  f14: {
    hulls: [[0,.1,-8.45,10.08,1.56,.87],[1.91,-.3,-9.24,3.9,.91,.77]],
    wing: [[1.08,-.07,3.05],[2.76,-.07,.56],[9.8,.16,-3.21],[9.8,.16,-4.28],[2.76,-.07,-3.57],[1.08,-.07,-5.74]],
    tail: [[2.19,-.1,-5.42],[5.09,-.17,-7.91],[5.09,-.17,-9],[2.19,-.1,-8.49]],
    fin: [[1.91,.53,-4.75],[1.91,3.63,-6.98],[1.91,3.55,-8.02],[1.91,.53,-8.47]],
  },
  f18: {
    hulls: [[0,.06,-7.72,8.87,1.43,.86],[.99,-.25,-8.02,2.85,.73,.61]],
    wing: [[.65,.16,5.1],[2.46,.28,1.27],[5.9,.24,-1.04],[5.9,.24,-2.85],[2.34,.16,-3.67],[.65,.16,-2.05]],
    tail: [[1.17,-.13,-4.35],[3.9,-.17,-6.41],[3.9,-.17,-7.58],[1.17,-.13,-7.78]],
    fin: [[1.24,.61,-3.73],[2.06,3.16,-5.87],[2.06,3.16,-6.62],[1.24,.61,-7.3]],
  },
  sr71: {
    hulls: [[0,.05,-15.1,16.44,1.36,.97],[5.7,.04,-13.39,5.4,1.08,1.06]],
    wing: [[0,-.08,16.14],[5.7,-.08,.45],[9.55,.22,-4.98],[9.55,.22,-8.68],[5.7,-.08,-12.06],[0,-.08,-14.86]],
    fin: [[5.7,.73,-7.34],[4.93,3.77,-9.13],[4.94,3.7,-10.61],[5.7,.73,-12.23]],
  },
};

export function buildAircraftSilhouette(kind) {
  const airframe = airframes[kind];
  if (!airframe) return null;
  const triangles = [];
  const add = (a, b, c, shade) => triangles.push({ p: [...a, ...b, ...c], shade });
  const mirror = (points, side) => points.map(([x, y, z]) => [x * side, y, z]);

  for (const [x, y, tail, nose, width, height] of airframe.hulls) {
    const length = nose - tail;
    const sections = [[tail + length * .14, .67], [nose - length * .26, 1]].map(([z, s]) =>
      [[x-width*s,y,z],[x,y+height*s,z],[x+width*s,y,z],[x,y-height*s,z]]);
    for (const side of x === 0 ? [1] : [-1, 1]) {
      const [back, front] = sections.map(points => mirror(points, side));
      for (const [i, shade] of [1.08, 1.1, .74, .71].entries()) {
        const j = (i + 1) % 4;
        add([x*side,y,nose],front[i],front[j],shade);
        add(front[i],front[j],back[i],shade);
        add(front[j],back[j],back[i],shade);
        add([x*side,y,tail],back[j],back[i],shade);
      }
    }
  }

  for (const [points, shade] of [[airframe.wing,.96],[airframe.tail,.9],[airframe.fin,.88]]) {
    if (!points) continue;
    for (const side of points.every(point => point[0] === 0) ? [1] : [-1,1]) {
      const shape = mirror(points, side);
      for (let i = 1; i < shape.length - 1; i++) add(shape[0],shape[i],shape[i + 1],shade);
    }
  }
  return triangles;
}
