// The graphics card can drop the page's WebGL context (a driver reset, a sleeping laptop, too many
// tabs on the GPU). The game's buffers and render targets are gone then, so the honest fix is a
// reload: the save is written first, and a comic card asks for one click. Styles are inline so the
// card works even if the stylesheet is what failed.

export const LOST_TEXT = { title: 'HANG ON!', body: 'The graphics reset. Click to reload.', saved: 'Your progress was saved.' };

export function watchContextLoss(canvas, { onLost = () => {}, doc = document, reload = () => location.reload() } = {}) {
  let card = null;
  function show(saved) {
    if (card) return card;
    card = doc.createElement('div');
    card.className = 'gl-lost';
    card.setAttribute('role', 'alertdialog');
    card.style.cssText = 'position:fixed;inset:0;z-index:200;display:grid;place-items:center;background:rgba(16,16,26,0.72);cursor:pointer';
    const box = doc.createElement('div');
    box.style.cssText = "background:#f5ecd4;color:#12101c;border:4px solid #12101c;box-shadow:8px 8px 0 #12101c;padding:22px 30px;text-align:center;max-width:min(460px,86vw);font:22px 'Barlow Condensed','Arial Narrow',sans-serif;transform:rotate(-1deg)";
    const h = doc.createElement('div');
    h.textContent = LOST_TEXT.title;
    h.style.cssText = "font:42px 'Bangers',Impact,sans-serif;letter-spacing:2px;color:#d3232e;text-shadow:3px 3px 0 #12101c;margin-bottom:8px";
    const p = doc.createElement('div');
    p.textContent = saved ? `${LOST_TEXT.body} ${LOST_TEXT.saved}` : LOST_TEXT.body;
    box.append(h, p);
    card.append(box);
    card.addEventListener('click', () => reload());
    doc.body.append(card);
    return card;
  }
  const lost = (e) => {
    // Lets the browser restore the context; the card still asks for a reload because the scene's
    // GPU data does not come back with it.
    e.preventDefault?.();
    if (doc.exitPointerLock && doc.pointerLockElement) doc.exitPointerLock();
    let saved = false;
    try { saved = onLost() !== false; } catch (err) { console.warn('save on context loss', err); }
    show(saved);
  };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', () => show(false));
  return { get card() { return card; }, dispose() { canvas.removeEventListener('webglcontextlost', lost); card?.remove(); } };
}
