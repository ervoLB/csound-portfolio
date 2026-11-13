import { describe, expect, it } from 'vitest';
import { CsoundCore } from '../../player/engine/csound-worklet.js';
import { createCore, csd, csoundModule, estimateFrequency, load, render, rms } from './harness';

const HEADER = 'sr = 48000\nksmps = 64\nnchnls = 2\n0dbfs = 1\n';

const SINE = csd(`${HEADER}
instr 1
  kAmp = chnget:k("amp")
  aSig = oscili(0.5, 440)
  out aSig * kAmp, aSig * kAmp
endin`);

describe('CsoundCore with the official Csound 7 wasm', () => {
  it('initialises, compiles a CSD and renders audio', async () => {
    const { core } = await createCore();
    const result = load(core, SINE, { channels: { amp: 1 } });
    expect(result).toMatchObject({ ok: true, sr: 48000, ksmps: 64, nchnls: 2, zerodbfs: 1 });
    const out = render(core, 0.5);
    expect(out.peak).toBeGreaterThan(0.45);
    expect(out.peak).toBeLessThan(0.55);
    expect(estimateFrequency(out.left)).toBeGreaterThan(430);
    expect(estimateFrequency(out.left)).toBeLessThan(450);
  });

  it('applies initial channel values before the first performance pass', async () => {
    const { core } = await createCore();
    load(core, csd(`${HEADER}
instr 1
  iAmp = chnget:i("amp")
  out oscili(iAmp, 440), oscili(iAmp, 440)
endin`), { channels: { amp: 0.25 } });
    expect(render(core, 0.2).peak).toBeCloseTo(0.25, 2);
  });

  it('changes sound when a control channel is set while playing', async () => {
    const { core } = await createCore();
    load(core, SINE, { channels: { amp: 0.2 } });
    const quiet = render(core, 0.2).peak;
    core.setChannel('amp', 1);
    render(core, 0.05); // let the change take effect
    const loud = render(core, 0.2).peak;
    expect(quiet).toBeCloseTo(0.1, 2);
    expect(loud).toBeCloseTo(0.5, 2);
  });

  it('reads control channels back and reports watched channels', async () => {
    const { core, messages } = await createCore();
    load(core, csd(`${HEADER}
instr 1
  chnset 0.75, "level"
  out a(0), a(0)
endin`));
    core.watch(['level'], 2);
    render(core, 0.05);
    expect(core.getChannel('level')).toBeCloseTo(0.75);
    const reports = messages.filter((m) => m.type === 'channels');
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.at(-1)!.values.level).toBeCloseTo(0.75);
  });

  it('forces the AudioContext sample rate so pitch stays correct for sr = 44100 CSDs', async () => {
    const { core } = await createCore();
    const result = load(core, csd(`sr = 44100
ksmps = 32
nchnls = 2
0dbfs = 1
instr 1
  a1 = oscili(0.5, 440)
  out a1, a1
endin`));
    expect(result).toMatchObject({ ok: true, sr: 48000 });
    const freq = estimateFrequency(render(core, 1).left);
    expect(freq).toBeGreaterThan(435);
    expect(freq).toBeLessThan(445);
  });

  it('handles CSDs that set kr instead of ksmps', async () => {
    const { core, logText } = await createCore();
    const result = load(core, csd(`sr = 44100
kr = 4410
nchnls = 2
0dbfs = 1
instr 1
  a1 = oscili(0.5, 440)
  out a1, a1
endin`));
    expect(result.ok, logText()).toBe(true);
    const out = render(core, 0.5);
    expect(out.peak).toBeGreaterThan(0.4);
    const freq = estimateFrequency(out.left);
    expect(freq).toBeGreaterThan(435);
    expect(freq).toBeLessThan(445);
  });

  it('scales output by 1/0dbfs for CSDs relying on the default 0dbfs', async () => {
    const { core } = await createCore();
    const result = load(core, csd(`sr = 48000
ksmps = 64
nchnls = 2
instr 1
  a1 = oscili(0dbfs * 0.5, 440)
  out a1, a1
endin`));
    expect(result.ok).toBe(true);
    const out = render(core, 0.3);
    expect(out.peak).toBeGreaterThan(0.45);
    expect(out.peak).toBeLessThan(0.55);
  });

  it('plays mono CSDs on both channels', async () => {
    const { core } = await createCore();
    load(core, csd(`sr = 48000
ksmps = 64
nchnls = 1
0dbfs = 1
instr 1
  out oscili(0.4, 220)
endin`));
    const out = render(core, 0.2);
    expect(out.peak).toBeGreaterThan(0.35);
    for (let i = 0; i < out.left.length; i += 97) expect(out.right[i]).toBe(out.left[i]);
  });

  it('produces gap-free audio when ksmps does not divide the render quantum', async () => {
    const { core } = await createCore();
    load(core, csd(`sr = 48000
ksmps = 100
nchnls = 2
0dbfs = 1
instr 1
  a1 = oscili(0.5, 1000)
  out a1, a1
endin`));
    const out = render(core, 0.5);
    // Every 128-frame block after the first must carry signal.
    for (let start = 128; start + 128 <= out.left.length; start += 128) {
      expect(rms(out.left, start, start + 128)).toBeGreaterThan(0.3);
    }
  });

  it('reports the end of a finite score and then outputs silence', async () => {
    const { core, messages } = await createCore();
    load(core, csd(`${HEADER}
instr 1
  out oscili(0.3, 440), oscili(0.3, 440)
endin`, 'i 1 0 0.2'));
    const out = render(core, 0.5);
    expect(messages.some((m) => m.type === 'ended')).toBe(true);
    expect(core.playing).toBe(false);
    expect(core.ended).toBe(true);
    expect(rms(out.left, out.left.length - 4800)).toBe(0);
  });

  it('returns a readable error with the line number for a broken CSD', async () => {
    const { core, logText } = await createCore();
    const broken = csd(`${HEADER}
instr 1
  aSig = oscilllli(0.5, 440)
  out aSig, aSig
endin`);
    const result = load(core, broken);
    expect(result.ok).toBe(false);
    expect(core.playing).toBe(false);
    expect(logText()).toMatch(/error/i);
    expect(logText()).toMatch(/line\s+12\b/);
    // The engine keeps working afterwards.
    expect(load(core, SINE, { channels: { amp: 1 } }).ok).toBe(true);
    expect(render(core, 0.1).peak).toBeGreaterThan(0.4);
  });

  it('switches instruments 50 times without unbounded memory growth', async () => {
    const { core } = await createCore();
    load(core, SINE, { channels: { amp: 1 } });
    render(core, 0.05);
    const baseline = core.memoryBytes();
    for (let i = 0; i < 50; i++) {
      const freq = 200 + i * 10;
      const result = load(core, csd(`${HEADER}
giTab ftgen 0, 0, 65536, 10, 1, 0.5, 0.25
instr 1
  a1 = oscili(0.5, ${freq}, giTab)
  out a1, a1
endin`));
      expect(result.ok).toBe(true);
      expect(render(core, 0.02).peak).toBeGreaterThan(0.1);
    }
    const grownMb = (core.memoryBytes() - baseline) / (1024 * 1024);
    expect(grownMb).toBeLessThan(32);
  });

  it('delivers MIDI to MIDI-enabled instruments only', async () => {
    const midiCsd = csd(`${HEADER}
massign 0, 2
instr 1
  out a(0), a(0)
endin
instr 2
  iFreq = cpsmidi()
  iAmp = ampmidi(0.5)
  a1 = oscili(iAmp, iFreq) * madsr(0.001, 0, 1, 0.01)
  out a1, a1
endin`);
    const { core } = await createCore();
    load(core, midiCsd, { midi: true });
    expect(render(core, 0.1).peak).toBe(0);
    expect(core.midi(0x90, 69, 127)).toBe(true);
    const on = render(core, 0.3);
    expect(on.peak).toBeGreaterThan(0.3);
    expect(estimateFrequency(on.left.subarray(4800))).toBeGreaterThan(430);
    core.midi(0x80, 69, 0);
    render(core, 0.1);
    expect(render(core, 0.1).peak).toBeLessThan(0.001);

    // Same CSD with MIDI disabled: messages are ignored.
    load(core, midiCsd, { midi: false });
    expect(core.midi(0x90, 69, 127)).toBe(false);
    expect(render(core, 0.2).peak).toBe(0);
  });

  it('does not start extra copies of instr 1 when MIDI is off (default routing)', async () => {
    const { core } = await createCore();
    load(core, csd(`${HEADER}
instr 1
  gkCount init 0
  gkCount += 1
  out a(0), a(0)
endin
instr 2
  chnset active:k(1), "copies"
endin`, 'i 1 0 z\ni 2 0 z'), { midi: false });
    render(core, 0.05);
    core.midi(0x90, 60, 100);
    render(core, 0.1);
    expect(core.getChannel('copies')).toBe(1);
  });

  it('limits overs so output never exceeds ±1 and flags clipping', async () => {
    const { core, messages } = await createCore();
    load(core, csd(`${HEADER}
instr 1
  a1 = oscili(4, 100)
  out a1, a1
endin`));
    const out = render(core, 0.5);
    expect(out.peak).toBeLessThanOrEqual(1);
    expect(messages.some((m) => m.type === 'level' && m.clipped === true)).toBe(true);
  });

  it('replaces NaN output with silence', async () => {
    const { core } = await createCore();
    load(core, csd(`${HEADER}
instr 1
  a1 = sqrt(a(-1))
  out a1, a1
endin`));
    const out = render(core, 0.1);
    expect(out.left.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('applies master gain smoothly', async () => {
    const { core } = await createCore();
    load(core, SINE, { channels: { amp: 1 } });
    render(core, 0.05);
    core.setGain(0);
    render(core, 0.01);
    expect(render(core, 0.1).peak).toBe(0);
    core.setGain(1);
    render(core, 0.01);
    expect(render(core, 0.1).peak).toBeGreaterThan(0.45);
  });

  it('rate-limits message floods', async () => {
    const { core, messages } = await createCore();
    load(core, csd(`${HEADER}
instr 1
  printks "tick %d\\n", 0, timeinstk()
  out a(0), a(0)
endin`));
    messages.length = 0;
    render(core, 1);
    const logs = messages.filter((m) => m.type === 'log');
    const lines = logs.reduce((n, m) => n + (m.lines as string[]).length, 0);
    const suppressed = logs.reduce((n, m) => n + (m.suppressed as number), 0);
    expect(lines).toBeLessThanOrEqual(250);
    expect(suppressed).toBeGreaterThan(0);
  });

  it('outputs silence before anything is loaded and after stop', async () => {
    const { core } = await createCore();
    expect(render(core, 0.05).peak).toBe(0);
    load(core, SINE, { channels: { amp: 1 } });
    expect(render(core, 0.05).peak).toBeGreaterThan(0.4);
    core.stop();
    expect(render(core, 0.05).peak).toBe(0);
  });

  it('handles the worklet message protocol in order', async () => {
    const messages: { type: string; [k: string]: any }[] = [];
    const core = new CsoundCore({ post: (m) => messages.push(m) });
    await core.handle({ type: 'init', wasm: await csoundModule() });
    expect(messages.at(-1)).toMatchObject({ type: 'initialized' });
    await core.handle({ type: 'load', requestId: 7, csd: SINE, midi: false, channels: { amp: 1 } });
    expect(messages.find((m) => m.type === 'loaded')).toMatchObject({ requestId: 7, ok: true });
    await core.handle({ type: 'getChannel', requestId: 8, name: 'amp' });
    expect(messages.find((m) => m.type === 'channelValue')).toMatchObject({ requestId: 8, value: 1 });
    await core.handle({ type: 'stop', requestId: 9 });
    expect(messages.find((m) => m.type === 'stopped')).toMatchObject({ requestId: 9 });
    await core.handle({ type: 'init', wasm: new Uint8Array([1, 2, 3]) });
    expect(messages.at(-1)).toMatchObject({ type: 'initialized' }); // second init is a no-op
  });

  it('recovers from a Csound trap by creating a fresh instance', async () => {
    const { core, messages } = await createCore();
    expect(core.instanceCount).toBe(1);
    load(core, csd(`${HEADER}
instr 1
  out oscili(0.3, 440), oscili(0.3, 440)
  if timeinsts() > 0.05 then
    exitnow
  endif
endin`));
    render(core, 0.3);
    expect(core.broken).toBe(true);
    expect(core.playing).toBe(false);
    expect(messages.some((m) => m.type === 'error')).toBe(true);
    expect(render(core, 0.05).peak).toBe(0);
    expect(load(core, SINE, { channels: { amp: 1 } }).ok).toBe(true);
    expect(core.instanceCount).toBe(2);
    expect(core.broken).toBe(false);
    expect(render(core, 0.1).peak).toBeGreaterThan(0.4);
  });

  it('accepts control messages before init without breaking later messages', async () => {
    const messages: { type: string; [k: string]: any }[] = [];
    const core = new CsoundCore({ post: (m) => messages.push(m) });
    await core.handle({ type: 'watch', names: ['level'] });
    await core.handle({ type: 'setChannel', name: 'amp', value: 1 });
    await core.handle({ type: 'midi', data: [0x90, 60, 100] });
    await core.handle({ type: 'getChannel', requestId: 3, name: 'amp' });
    await core.handle({ type: 'init', wasm: await csoundModule() });
    expect(messages.find((m) => m.type === 'initialized')).toBeTruthy();
    await core.handle({ type: 'load', requestId: 4, csd: SINE, channels: { amp: 1 } });
    expect(messages.find((m) => m.type === 'loaded')).toMatchObject({ ok: true });
  });

  it('never rejects from handle(), even for malformed messages', async () => {
    const { core, messages } = await createCore();
    await expect(core.handle({ type: 'setChannels', values: null })).resolves.toBeUndefined();
    await expect(core.handle({ type: 'load', requestId: 1 } as never)).resolves.toBeUndefined();
    await expect(core.handle({ type: 'nonsense' })).resolves.toBeUndefined();
    expect(messages.some((m) => m.type === 'loaded' && m.ok === false)).toBe(true);
  });

  it('reports a clear error for an invalid wasm binary', async () => {
    const messages: { type: string; [k: string]: any }[] = [];
    const core = new CsoundCore({ post: (m) => messages.push(m) });
    await core.handle({ type: 'init', wasm: new Uint8Array([0, 1, 2, 3]) });
    expect(messages.at(-1)!.type).toBe('initError');
    await core.handle({ type: 'load', requestId: 1, csd: SINE });
    expect(messages.at(-1)).toMatchObject({ type: 'loaded', ok: false });
  });
});
