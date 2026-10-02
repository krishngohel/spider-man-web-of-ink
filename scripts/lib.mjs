// Shared launch settings for every script browser: muted (the owner works on this laptop while
// scripts run) and on the real GPU.
export function launchArgs(extra = []) {
  return ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu-rasterization', ...extra];
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
