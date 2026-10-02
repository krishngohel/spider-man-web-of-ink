// The story's people who are not in the playable roster, in the roster's format so the same
// builder makes them: MJ, Aunt May, Captain Yuri Watanabe, J. Jonah Jameson and a police officer.
export const CAST = {
  // Peter out of the suit (visiting May): a blue jacket, brown hair.
  parker: { id: 'parker', name: 'Peter', body: 'm', outfit: { jacket: 0x34548a, pants: 0x4a4a52, shoes: 0xe8e8ea, skin: 0.15, head: 0, hat: 0x4a3020, accent: 0xd8d8de, pattern: 0 } },
  mj: { id: 'mj', name: 'MJ', body: 'f', outfit: { jacket: 0x2f7a4a, pants: 0x2a3a5a, shoes: 0x3a2a20, skin: 0.12, head: 0, hat: 0xc8402a, accent: 0xf2e6d0, pattern: 0 }, gear: ['hairLong'], hairColor: 0xc8402a },
  may: { id: 'may', name: 'Aunt May', body: 'f', outfit: { jacket: 0x8a5a8a, pants: 0x5a4a5a, shoes: 0x3a3030, skin: 0.14, head: 0, hat: 0xe6e6ea, accent: 0xf4f0e6, pattern: 0 } },
  yuri: { id: 'yuri', name: 'Captain Watanabe', body: 'f', outfit: { jacket: 0x1f2c4a, pants: 0x1f2c4a, shoes: 0x111111, skin: 0.2, head: 0, hat: 0x141418, accent: 0xd8c040, pattern: 0 }, gear: ['hairLong'], hairColor: 0x141418 },
  jameson: { id: 'jameson', name: 'J. Jonah Jameson', body: 'm', outfit: { jacket: 0x4a4a52, pants: 0x3a3a40, shoes: 0x1a1a1a, skin: 0.25, head: 0, hat: 0x2a2a2e, accent: 0xf4f4f4, pattern: 0 }, gear: ['moustache'], hairColor: 0x2a2a2e },
  cop: { id: 'cop', name: 'Officer', body: 'm', outfit: { jacket: 0x1f2c4a, pants: 0x1f2c4a, shoes: 0x111111, skin: 0.55, head: 1, hat: 0x1f2c4a, accent: 0xd8c040, pattern: 0 } },
};
