import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectMidi } from '../../player/engine/midiDetect';
import { createCore, load, render } from './harness';

/** The example instruments, as fixed copies (tests/fixtures/instruments), so replacing the examples never breaks the tests. */
function wrapOrc(name: string): string {
  return readFileSync(join(__dirname, '../fixtures/instruments', `${name}.csd`), 'utf8');
}

describe("the user's instruments on official Csound 7.0.0", () => {
  it('algo_synth plays on its own and has MIDI off', async () => {
    const code = wrapOrc('algo_synth');
    expect(detectMidi(code).enabled).toBe(false);
    const { core, logText } = await createCore();
    const result = load(core, code, { midi: false, channels: { bpm: 120, run: 1, cutoff: 2000, res: 0.3 } });
    expect(result.ok, logText()).toBe(true);
    expect(render(core, 2).peak).toBeGreaterThan(0.01);
    expect(logText()).not.toMatch(/\berror\b/i);
  });

  it('grand_piano plays from MIDI notes and from its button', async () => {
    const code = wrapOrc('grand_piano');
    expect(detectMidi(code)).toMatchObject({ enabled: true, detail: 'massign' });
    const { core, logText } = await createCore();
    const defaults = { hardness: 6000, sustain: 2, stiffness: 0.1, detune: 0.05, body: 0.3, reverb: 0.2, trig: 0 };
    const result = load(core, code, { midi: true, channels: defaults });
    expect(result.ok, logText()).toBe(true);
    expect(render(core, 0.3).peak).toBeLessThan(0.001);
    core.midi(0x90, 60, 100);
    expect(render(core, 1).peak, logText()).toBeGreaterThan(0.01);
    core.midi(0x80, 60, 0);

    // The momentary button triggers a note too.
    load(core, code, { midi: true, channels: defaults });
    core.setChannel('trig', 1);
    const pressed = render(core, 0.25).peak; // the hammer attack happens right away
    core.setChannel('trig', 0);
    expect(pressed).toBeGreaterThan(0.01);
    expect(logText()).not.toMatch(/\berror\b/i);
  });

  it('grand_piano is unstable on low notes (same in native Csound 6.18), and the engine keeps output finite', async () => {
    const code = wrapOrc('grand_piano');
    const { core } = await createCore();
    load(core, code, { midi: true, channels: { hardness: 6000, sustain: 2, stiffness: 0.1, detune: 0.05, body: 0.3, reverb: 0.2, trig: 0 } });
    core.midi(0x90, 48, 100);
    const out = render(core, 1);
    expect(out.left.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true);
  });

  it('sub_synth plays from MIDI notes', async () => {
    const code = wrapOrc('sub_synth');
    expect(detectMidi(code).enabled).toBe(true);
    const { core, logText } = await createCore();
    const result = load(core, code, {
      midi: true,
      channels: { cutoff: 1000, attack: 0.01, decay: 0.5, sustain: 0.7, release: 0.3 },
    });
    expect(result.ok, logText()).toBe(true);
    core.midi(0x90, 48, 110);
    expect(render(core, 1).peak, logText()).toBeGreaterThan(0.01);
    expect(logText()).not.toMatch(/\berror\b/i);
  });
});
