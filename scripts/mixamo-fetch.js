// Downloads the combat clips from Mixamo for the character selected there (Y Bot, the default).
// Run in the page context of a mixamo.com tab where the owner is logged in (the Chrome
// extension's JavaScript tool; never the mouse). Each clip is exported as FBX with skin, 30 fps,
// no keyframe reduction, and saved to Downloads as <Name>.fbx. Raw files stay out of the repo
// (Mixamo's terms allow use in games, not redistribution of the files).
// Then: node scripts/fbx2glb.mjs <files> and node scripts/retarget-mocap.mjs --map mixamo --append ...
(async () => {
  const WANT = {
    Martelo_2: 'Martelo 2', Armada: 'Armada', Meia_Lua: 'Meia Lua De Compasso', Leg_Sweep: 'Leg Sweep',
    Flip_Kick: 'Flip Kick', Uppercut_Hit: 'Receiving An Uppercut', Flying_Kick: 'Flying Kick',
    Scissor_Kick: 'Scissor Kick', Hurricane_Kick: 'Hurricane Kick', Front_Flip: 'Front Flip',
    Aerial_Evade: 'Aerial Evade', Corkscrew_Evade: 'Corkscrew Evade', Au_To_Role: 'Au To Role', Backflip: 'Backflip',
    Pull_Rope: 'Pulling A Rope', Shoulder_Throw: 'Shoulder Throw', Kip_Kick: 'Inverted Double Kick To Kip Up',
    Spin_Flip_Kick: 'Spin Flip Kick', Sweep_Fall: 'Sweep Fall', Knocked_Down: 'Knocked Down', Kip_Up: 'Kip Up',
  };
  const token = localStorage.getItem('access_token');
  if (!token) return 'not logged in: no access_token in localStorage';
  const H = { Authorization: `Bearer ${token}`, 'X-Api-Key': 'mixamo2', 'Content-Type': 'application/json', Accept: 'application/json' };
  const api = async (path, init = {}) => {
    const r = await fetch('https://www.mixamo.com/api/v1/' + path, { ...init, headers: H });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { primary_character_id: charId } = await api('characters/primary');
  const log = [];
  for (const [name, query] of Object.entries(WANT)) {
    try {
      const found = await api(`products?page=1&limit=24&order=&type=Motion%2CMotionPack&query=${encodeURIComponent(query)}`);
      const list = found.results ?? [];
      const hit = list.find((x) => x.name.toLowerCase() === query.toLowerCase() && x.type === 'Motion') ?? list.find((x) => x.type === 'Motion');
      if (!hit) { log.push(`${name}: not found`); continue; }
      const prod = await api(`products/${hit.id}?similar=0&character_id=${charId}`);
      const gms = prod.details.gms_hash;
      const gmsHash = { ...gms, params: (gms.params ?? []).map((q) => q[1]).join(','), overdrive: 0, mirror: false, trim: gms.trim ?? [0, 100] };
      await api('animations/export', { method: 'POST', body: JSON.stringify({ character_id: charId, gms_hash: [gmsHash], preferences: { format: 'fbx7_2019', skin: 'true', fps: '30', reducekf: '0' }, product_name: hit.name, type: 'Motion' }) });
      let url = null;
      for (let i = 0; i < 60 && !url; i++) {
        await sleep(1500);
        const m = await api(`characters/${charId}/monitor`);
        if (m.status === 'completed') url = m.job_result;
        else if (m.status === 'failed') throw new Error('export failed');
      }
      if (!url) throw new Error('export timed out');
      const blob = await (await fetch(url)).blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `${name}.fbx`;
      document.body.append(a); a.click(); a.remove();
      log.push(`${name}: ${hit.name} (${(blob.size / 1024).toFixed(0)} KB)`);
      await sleep(800);
    } catch (err) { log.push(`${name}: ${err.message}`); }
  }
  return log.join('\n');
})();
