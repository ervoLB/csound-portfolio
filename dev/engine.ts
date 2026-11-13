// Development page for the engine (not part of the published site).
import { CsoundEngine } from '../player/engine/CsoundEngine';
import { onWasmProgress } from '../player/engine/wasmLoader';

const HEADER = 'sr = 44100\nksmps = 32\nnchnls = 2\n0dbfs = 1';
const A = `<CsoundSynthesizer>
<CsOptions>
-odac
</CsOptions>
<CsInstruments>
${HEADER}
instr 1
  kAmp = chnget:k("amp")
  a1 = oscili(0.5 * kAmp, 440)
  out a1, a1
endin
</CsInstruments>
<CsScore>
i 1 0 z
</CsScore>
</CsoundSynthesizer>`;
const B = `<CsoundSynthesizer>
<CsInstruments>
${HEADER}
massign 0, 2
instr 1
endin
instr 2
  a1 = vco2(ampmidi(0.3), cpsmidi()) * madsr(0.01, 0.1, 0.7, 0.2)
  out a1, a1
endin
</CsInstruments>
<CsScore>
i 1 0 z
</CsScore>
</CsoundSynthesizer>`;

const engine = CsoundEngine.shared();
engine.preload();
engine.installGestureUnlock(window);
const $ = (id: string) => document.getElementById(id)!;
const amp = $('amp') as HTMLInputElement;

engine.on('state', ({ state, error }) => ($('state').textContent = error ? `${state}: ${error}` : state));
engine.on('log', ({ lines }) => {
  $('log').textContent += lines.join('\n') + '\n';
});
let maxPeak = 0;
engine.on('level', ({ peakL }) => {
  maxPeak = Math.max(maxPeak, peakL);
  $('peak').textContent = peakL.toFixed(3);
});
onWasmProgress((p) => ($('wasm').textContent = `${p.status} ${Math.round(p.fraction * 100)}%`));

$('play-a').addEventListener('click', () => void engine.play(A, { channels: { amp: Number(amp.value) } }));
$('play-b').addEventListener('click', () => void engine.play(B));
$('stop').addEventListener('click', () => void engine.stop());
amp.addEventListener('input', () => engine.setChannel('amp', Number(amp.value)));

// Hooks for the end-to-end test.
Object.assign(window, {
  __engine: engine,
  __resetPeak: () => (maxPeak = 0),
  __maxPeak: () => maxPeak,
});
