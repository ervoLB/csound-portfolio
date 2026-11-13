<CsoundSynthesizer>
<CsOptions>
-odac
</CsOptions>
<CsInstruments>
;<@INSTRUMENT: {name: "Algo Synth"; date: "2026-11"; description: "A generative pentatonic sequence playing a filtered sawtooth voice. Change tempo, cutoff and resonance while it runs."; tags: "generative, sequencer, subtractive"}>

sr = 48000
ksmps = 64
nchnls = 2
0dbfs = 1

; --- TABLES ---
; Pentatonic scale (C Major Pentatonic: C, D, F, G, A) in MIDI notes
giScale ftgen 1, 0, 8, -2, 60, 62, 65, 67, 69, 72, 74, 77

instr 1 ; --- THE COMPOSER ---
    ; GUI Inputs
    kBPM chnget "bpm" ; <@WIDGET knob:{id: "kbpm"; channel: "bpm"; label: "Tempo (BPM)"; range: 40-200; default: 120; step: 1; showValue: true}>
    kRun chnget "run" ; <@WIDGET toggle:{id: "trun", label: "Play/Stop", default: 1}>

    ; Logic
    kTickRate = (kBPM / 60) * 2 ; 8th notes calculation
    kTrig metro kTickRate
    
    kIndex init 0
    if (kTrig == 1 && kRun == 1) then
        ; Algorithm: Cycle through the scale and add random octave
        kMidiNote table kIndex, giScale
        
        ; Random octave selection (0, 1, or 2)
        kRndVal random 0, 3
        kOctave = floor(kRndVal) * 12
        kFreq = cpsmidinn(kMidiNote + kOctave)
        
        ; Trigger the voice (instr 2)
        schedulek 2, 0, 0.2, kFreq
        
        ; Increment index and wrap around scale length
        kIndex = (kIndex + 1) % 8
    endif
endin

instr 2 ; --- THE VOICE ---
    iFreq = p4
    
    ; GUI Inputs
    kCutoff chnget "cutoff" ; <@WIDGET knob:{id: "kcut"; channel: "cutoff"; label: "Cutoff"; range: 100-8000; default: 2000; step: 1; showValue: true}>
    kRes chnget "res" ; <@WIDGET knob:{id: "kres"; channel: "res"; label: "Resonance"; range: 0-0.9; default: 0.3; step: 0.01; showValue: true}>
    
    ; Smoothing to prevent zipper noise
    kSmoothCut portk kCutoff, 0.05
    kSmoothRes portk kRes, 0.05

    ; Envelope: Amp envelope with 0.2s release
    ; Note: xtratim is not needed here as instr duration is set by p3 (0.2) in schedulek
    aEnv expsegr 0.001, 0.01, 0.5, 0.1, 0.0001
    
    ; Oscillator (Sawtooth mode = 0)
    aOsc vco2 0.3 * k(aEnv), iFreq, 0 
    
    ; Filter
    aFilt moogladder aOsc, kSmoothCut, kSmoothRes
    
    ; Output
    outch 1, aFilt, 2, aFilt
endin
</CsInstruments>
<CsScore>
; Keep instr 1 (the control instrument) running until the player stops it.
i 1 0 z
</CsScore>
</CsoundSynthesizer>
