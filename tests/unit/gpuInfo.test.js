import { describe, it, expect } from 'vitest';
import { gpuShortName, looksIntegrated, gpuHintText, detectPlatform } from '../../src/ui/gpuInfo.js';

const NV = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028A0) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const INTEL = 'ANGLE (Intel, Intel(R) UHD Graphics 770 (0x0000A780) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const M1 = 'Apple M1';

describe('gpu info', () => {
  it('reads the card name out of the ANGLE string', () => {
    expect(gpuShortName(NV)).toBe('NVIDIA GeForce RTX 4060 Laptop GPU');
    expect(gpuShortName(INTEL)).toBe('Intel(R) UHD Graphics 770');
    expect(gpuShortName(M1)).toBe('Apple M1');
  });
  it('flags built-in graphics, not discrete cards or Apple chips', () => {
    expect(looksIntegrated(INTEL)).toBe(true);
    expect(looksIntegrated(NV)).toBe(false);
    expect(looksIntegrated('ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics, D3D11)')).toBe(false);
    expect(looksIntegrated(M1)).toBe(false);
  });
  it('gives advice for the platform, with no dashes', () => {
    expect(gpuHintText(INTEL, 'windows')).toContain('High performance');
    expect(gpuHintText(INTEL, 'mac')).toContain('Low Power Mode');
    for (const p of ['windows', 'mac', 'other']) expect(gpuHintText(INTEL, p)).not.toMatch(new RegExp(String.fromCharCode(0x2014, 0x7c, 0x2013)));
  });
  it('tells a Mac from Windows', () => {
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel' })).toBe('mac');
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32' })).toBe('windows');
  });
});
