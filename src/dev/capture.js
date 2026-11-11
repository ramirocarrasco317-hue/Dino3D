/**
 * Development capture helper: composites the WebGL frame with the DOM overlay
 * and posts the result to the dev server, which writes it to /shots.
 * Only loaded on demand (never referenced by the production bundle path).
 */
export async function capture(name, engine) {
  const canvas = engine.renderer.domElement;
  // Re-render immediately so the drawing buffer is guaranteed to be intact.
  engine.renderer.render(engine.scene, engine.camera);
  const gl = canvas.toDataURL('image/png');

  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');

  const base = await loadImage(gl);
  ctx.drawImage(base, 0, 0, out.width, out.height);

  try {
    const { toPng } = await import('html-to-image');
    const uiNode = document.getElementById('ui');
    const uiUrl = await toPng(uiNode, {
      backgroundColor: undefined,
      pixelRatio: out.width / window.innerWidth,
      cacheBust: true,
      filter: (node) => node.id !== 'fps',
    });
    const uiImg = await loadImage(uiUrl);
    ctx.drawImage(uiImg, 0, 0, out.width, out.height);
  } catch (err) {
    console.warn('[capture] UI overlay could not be rasterised', err);
  }

  const data = out.toDataURL('image/png');
  const res = await fetch('/__shot', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, data }),
  });
  return res.json();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
