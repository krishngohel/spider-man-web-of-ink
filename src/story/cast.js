// The story's people who are not in the playable roster, in the roster's format so the same
// builder makes them: MJ, Aunt May, Captain Yuri Watanabe, J. Jonah Jameson and a police officer.
export const CAST = {
  // Peter out of the suit (visiting May): a blue jacket, brown hair.
  parker: { id: 'parker', name: 'Peter', body: 'm', outfit: { jacket: 0x34548a, pants: 0x4a4a52, shoes: 0xe8e8ea, skin: 0.15, head: 0, hat: 0x4a3020, accent: 0xd8d8de, pattern: 0 } },
  mj: { id: 'mj', name: 'MJ', body: 'f', outfit: { jacket: 0x2f7a4a, pants: 0x2a3a5a, shoes: 0x3a2a20, skin: 0.12, head: 0, hat: 0xc8402a, accent: 0xf2e6d0, pattern: 0 }, gear: ['hairLong'], hairColor: 0xc8402a },
  may: { id: 'may', name: 'Aunt May', body: 'f', outfit: { jacket: 0x8a5a8a, pants: 0x5a4a5a, shoes: 0x3a3030, skin: 0.14, head: 0, hat: 0xe6e6ea, accent: 0xf4f0e6, pattern: 0 } },
  yuri: { id: 'yuri', name: 'Captain Watanabe', body: 'f', outfit: { jacket: 0x1f2c4a, pants: 0x1f2c4a, shoes: 0x111111, skin: 0.2, head: 0, hat: 0x141418, accent: 0xd8c040, pattern: 0 }, gear: ['hairLong'], hairColor: 0x141418 },
  jameson: { id: 'jameson', name: 'J. Jonah Jameson', body: 'm', outfit: { jacket: 0x4a4a52, pants: 0x3a3a40, shoes: 0x1a1a1a, skin: 0.25, head: 0, hat: 0x2a2a2e, accent: 0xf4f4f4, pattern: 0 }, gear: ['moustache'], hairColor: 0x2a2a2e },
  connors: { id: 'connors', name: 'Dr. Connors', body: 'm', outfit: { jacket: 0xf2f2ee, pants: 0x4a4a52, shoes: 0x2a2a2a, skin: 0.2, head: 0, hat: 0x5a3a20, accent: 0x6a8aa8, pattern: 0 } },
  robbie: { id: 'robbie', name: 'Robbie Robertson', body: 'm', outfit: { jacket: 0x5a5a62, pants: 0x3a3a42, shoes: 0x1a1a1a, skin: 0.72, head: 0, hat: 0xb8b8bc, accent: 0xf4f4f4, shades: 1, pattern: 0 } },
  cop: { id: 'cop', name: 'Officer', body: 'm', outfit: { jacket: 0x1f2c4a, pants: 0x1f2c4a, shoes: 0x111111, skin: 0.55, head: 1, hat: 0x1f2c4a, accent: 0xd8c040, pattern: 0 } },
};

// Everyday New Yorkers for the strolls (students, volunteers, office workers, neighbours), in the
// same format; a stroll names them by id. Looks only: their lines live in the steps.
const P = (body, jacket, pants, shoes, skin, hair, accent, more = {}) => ({ body, outfit: { jacket, pants, shoes, skin, head: 0, hat: hair, accent, pattern: 0, ...(more.outfit ?? {}) }, gear: more.gear ?? [], hairColor: hair });
export const CROWD = Object.fromEntries(Object.entries({
  studentA: P('m', 0x3a6a9a, 0x2a2a3a, 0xe8e8ea, 0.35, 0x2a1a10, 0xf2c230),
  studentB: P('f', 0xc8402a, 0x2a3a5a, 0xf2f2f2, 0.5, 0x1a1210, 0xf4ead2, { gear: ['hairLong'] }),
  studentC: P('m', 0x4a8a4a, 0x3a3a40, 0x2a2a2a, 0.15, 0xc89a4a, 0xe8e8ea),
  studentD: P('f', 0x8a5aa8, 0x1f2c4a, 0xe8e8ea, 0.25, 0x5a3a20, 0xf2f2f2, { gear: ['hairLong'] }),
  studentE: P('m', 0xd8a030, 0x4a4a52, 0x8a3a2a, 0.7, 0x141414, 0x2a2a2a),
  studentF: P('f', 0x2a8a8a, 0x5a4a3a, 0x1a1a1a, 0.08, 0xd8b060, 0xf4f0e6, { gear: ['hairLong'] }),
  prof: P('m', 0x6a5a4a, 0x4a4a52, 0x2a1a10, 0.3, 0x9a9aa0, 0xd8d0c0, { outfit: { shades: 1 } }),
  volunteerA: P('f', 0xd8402a, 0x2a2a3a, 0xe8e8ea, 0.6, 0x141414, 0xf4f0e6, { gear: ['hairLong'] }),
  volunteerB: P('m', 0xd8402a, 0x3a3a40, 0x2a2a2a, 0.2, 0x3a2a1a, 0xf4f0e6),
  workerA: P('m', 0x2a2f3a, 0x2a2f3a, 0x111111, 0.4, 0x2a1a10, 0xe8e8f0),
  workerB: P('f', 0x4a4a5a, 0x2a2a30, 0x111111, 0.12, 0x8a4a2a, 0xe8e8f0, { gear: ['hairLong'] }),
  elder: P('m', 0x8a7a5a, 0x5a4a3a, 0x3a2a1a, 0.45, 0xd8d8dc, 0xd8c8a0),
  kid: P('m', 0xf2c230, 0x2a5fb0, 0xe8e8ea, 0.55, 0x141414, 0xd8392b),
  vendor: P('m', 0xf4f0e6, 0x3a3a40, 0x2a2a2a, 0.3, 0x2a2a2e, 0xd8392b),
}).map(([id, d]) => [id, { id, name: 'Passer-by', ...d }]));
