// Short notices (the Low Power Mode note) shown one at a time for a few seconds, never with a
// button to press (a locked pointer can't click it). They only show, and only count down, while
// `allowed` holds (in play, not over a menu, a comic or the title); one that is up when play stops
// steps aside and comes back with the time it had left. Pure: the caller ticks it with dt.
export function createNoticeQueue({ render, hide, gap = 0.8 }) {
  const waiting = [];
  let cur = null, left = 0, shown = false, pause = 0;

  function off() { if (shown) { hide(); shown = false; } }

  return {
    push(text, secs = 9) {
      if (cur?.text === text || waiting.some((n) => n.text === text)) return;
      waiting.push({ text, secs });
    },
    tick(dt, allowed) {
      if (!allowed) { off(); return; }
      if (cur) {
        if (!shown) { render(cur.text); shown = true; }
        left -= dt;
        if (left <= 0) { off(); cur = null; pause = gap; }
        return;
      }
      if (pause > 0) { pause -= dt; return; }
      if (waiting.length) { cur = waiting.shift(); left = cur.secs; render(cur.text); shown = true; }
    },
    get showing() { return shown ? cur.text : null; },
    get waiting() { return waiting.length; },
  };
}
