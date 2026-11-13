<CsoundSynthesizer>
<CsOptions>
-odac
</CsOptions>
<CsInstruments>
;<@INSTRUMENT: {name: "Sub Synth"; date: "2025-09"; description: "Subtractive synth with an ADSR envelope and a resonant low-pass filter, played from the on-screen keyboard or MIDI."; tags: "subtractive, synth, midi"}>

sr = 48000
ksmps = 64
nchnls = 2
0dbfs = 1

; <@WIDGET midi_keyboard:{id: "midi_keyboard_001"; midi_channel: 1}>

; Global variables to pass widget values from master to voice
gk_cutoff init 1000
gk_attack init 0.01
gk_decay init 0.5
gk_sustain init 0.7
gk_release init 0.3

instr 1
    ; Read all knobs continuously and store in globals
    kCutoff chnget "cutoff" ; <@WIDGET knob:{id: "knob_cutoff"; channel: "cutoff"; label: "Filter Cutoff"; range: 100-8000; default: 1000; step: 1; showValue: true; knobColor: "#1e1e2e"; arcColor: "#ff6b6b"}>
    kCutoff limit kCutoff, 100, 8000
    gk_cutoff = kCutoff

    kAttack chnget "attack" ; <@WIDGET knob:{id: "knob_attack"; channel: "attack"; label: "Attack"; range: 0.001-1; default: 0.01; step: 0.001; showValue: true; knobColor: "#1e1e2e"; arcColor: "#00c9b7"}>
    kAttack limit kAttack, 0.001, 1
    gk_attack = kAttack

    kDecay chnget "decay" ; <@WIDGET knob:{id: "knob_decay"; channel: "decay"; label: "Decay"; range: 0.01-2; default: 0.5; step: 0.01; showValue: true; knobColor: "#1e1e2e"; arcColor: "#00c9b7"}>
    kDecay limit kDecay, 0.01, 2
    gk_decay = kDecay

    kSustain chnget "sustain" ; <@WIDGET knob:{id: "knob_sustain"; channel: "sustain"; label: "Sustain"; range: 0-1; default: 0.7; step: 0.01; showValue: true; knobColor: "#1e1e2e"; arcColor: "#00c9b7"}>
    kSustain limit kSustain, 0, 1
    gk_sustain = kSustain

    kRelease chnget "release" ; <@WIDGET knob:{id: "knob_release"; channel: "release"; label: "Release"; range: 0.01-2; default: 0.3; step: 0.01; showValue: true; knobColor: "#1e1e2e"; arcColor: "#00c9b7"}>
    kRelease limit kRelease, 0.01, 2
    gk_release = kRelease
endin

; Voice instrument triggered by MIDI note-on
massign 0, 10

instr 10
    iFreq cpsmidi

    ; Capture current global widget values at init time
    iAttack  = i(gk_attack)
    iDecay   = i(gk_decay)
    iSustain = i(gk_sustain)
    iRelease = i(gk_release)
    iCutoff  = i(gk_cutoff)

    ; Corrected: madsr expects attack, decay, sustain level, release
    aEnv madsr iAttack, iDecay, iSustain, iRelease
    aSig vco2 k(aEnv), k(iFreq),12  ; mode 1 = sawtooth
    aOut moogladder aSig, iCutoff, 0.7
    outs aOut, aOut
endin
</CsInstruments>
<CsScore>
; Keep instr 1 (the control instrument) running until the player stops it.
i 1 0 z
</CsScore>
</CsoundSynthesizer>
