<CsoundSynthesizer>
<CsOptions>
-odac
</CsOptions>
<CsInstruments>
;<@INSTRUMENT: {name: "Widget Showcase"; description: "Every widget type, for testing the board."; tags: "test"; midi: "on"}>
sr = 48000
ksmps = 32
nchnls = 2
0dbfs = 1

massign 0, 2

instr 1
  kFreq = chnget:k("freq")        ; <@WIDGET knob:{label: "Frequency"; range: 50-2000; default: 220; scale: "logarithmic"; group: "Oscillator"}>
  kAmp = chnget:k("amp")          ; <@WIDGET slider:{label: "Level"; range: 0-1; default: 0.3; group: "Oscillator"}>
  kWave = chnget:k("wave")        ; <@WIDGET dropdown:{label: "Wave"; options: "Saw=0; Square=2; Triangle=12"; group: "Oscillator"}>
  kOn = chnget:k("on")            ; <@WIDGET toggle:{label: "Drone"; default: 1; group: "Oscillator"}>
  kVib = chnget:k("vib")          ; <@WIDGET checkbox:{label: "Vibrato"; group: "Oscillator"}>
  kX = chnget:k("x")              ; <@WIDGET xypad:{label: "Filter"; channel_x: "x"; channel_y: "y"; range_x: 100-8000; range_y: 0-0.9; default_x: 2000; default_y: 0.3; group: "Filter"}>
  kY = chnget:k("y")
  kHit = chnget:k("hit")          ; <@WIDGET button:{label: "Accent"; group: "Filter"}>
  ; <@WIDGET label:{text: "Drag the pad to move cutoff (x) and resonance (y)."; group: "Filter"}>

  kVibLfo = lfo(kVib * 6, 5)
  aOsc = vco2(kAmp * kOn * (1 + kHit), kFreq + kVibLfo, i(kWave))
  aOut = moogladder(aOsc, port(kX, 0.02), kY)
  kRms = rms(aOut)
  chnset(kRms * 3, "level")       ; <@WIDGET meter:{label: "Output"; range: 0-1; group: "Monitor"}>
  chnset(kRms, "rms")             ; <@WIDGET label:{id: "rms_text"; text: "RMS: {value}"; decimals: 3; group: "Monitor"}>
  out aOut, aOut
endin

instr 2
  a1 = vco2(ampmidi(0.25), cpsmidi()) * madsr(0.01, 0.1, 0.6, 0.2)
  out a1, a1
endin
; <@WIDGET midi_keyboard:{label: "Keys"; start_note: 48; end_note: 72; group: "Play"}>
</CsInstruments>
<CsScore>
i 1 0 z
</CsScore>
</CsoundSynthesizer>
