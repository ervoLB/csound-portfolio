<CsoundSynthesizer>
<CsOptions>
-odac
</CsOptions>
<CsInstruments>
;<@INSTRUMENT: {name: "Expressive Synth"; date: "2026-02"; description: "MIDI synth with three waveforms, a Moog ladder filter with its own envelope, and vibrato."; tags: "subtractive, synth, midi"; midi: "on"}>

sr = 48000
ksmps = 64
nchnls = 2
0dbfs = 1

; --- TABLES ---
giSine ftgen 1, 0, 16384, 10, 1 ; Standard Sine Wave

instr 1
    ; --- 1. INPUTS & CONTROLS ---
    iFreq cpsmidi     ; Get frequency from MIDI note
    iAmp ampmidi 1    ; Get velocity scaled 0-1
    
    ; Master Controls
    kGain chnget "gain" ; <@WIDGET slider:{id: "sl_gain"; channel: "gain"; label: "Master Gain"; range: 0-1; default: 0.7}>
    kWave chnget "wave" ; <@WIDGET dropdown:{id: "dr_wave"; channel: "wave"; label: "Waveform"; options: "Sine=0;Saw=1;Square=2"}>
    
    ; Filter Controls
    kCutoff chnget "cutoff" ; <@WIDGET knob:{id: "kn_cut"; channel: "cutoff"; label: "Filter Cutoff"; range: 100-10000; default: 1000}>
    kRes chnget "res" ; <@WIDGET knob:{id: "kn_res"; channel: "res"; label: "Resonance"; range: 0-0.9; default: 0.3}>
    kFiltEnvAmt chnget "f_env_amt" ; <@WIDGET knob:{id: "kn_fenv"; channel: "f_env_amt"; label: "Filter Env Amt"; range: 0-5000; default: 2000}>
    kFiltDecay chnget "f_decay" ; <@WIDGET knob:{id: "kn_fdec"; channel: "f_decay"; label: "Filter Decay"; range: 0.01-2; default: 0.2}>

    ; Modulation Controls
    kVibRate chnget "vib_rate" ; <@WIDGET knob:{id: "kn_vrate"; channel: "vib_rate"; label: "Vib Rate"; range: 0-10; default: 5}>
    kVibDepth chnget "vib_depth" ; <@WIDGET knob:{id: "kn_vdepth"; channel: "vib_depth"; label: "Vib Depth"; range: 0-20; default: 0}>
    kPW chnget "pw" ; <@WIDGET knob:{id: "kn_pw"; channel: "pw"; label: "Pulse Width"; range: 0.01-0.99; default: 0.5}>

    ; <@WIDGET midi_keyboard:{id: "kb_001"; midi_channel: 1}>

    ; --- 2. MODULATION (LFO) ---
    kLfo poscil kVibDepth, kVibRate, giSine
    kTargetFreq = iFreq + kLfo

    ; --- 3. SIGNAL GENERATION ---
    aSig init 0
    if kWave == 1 then
        aSig vco2 1, kTargetFreq, 0    ; Sawtooth
    elseif kWave == 2 then
        aSig vco2 1, kTargetFreq, 2, kPW ; Square/Pulse with PW control
    else
        aSig poscil 1, kTargetFreq, 1  ; Sine
    endif

    ; --- 4. ENVELOPES ---
    ; Amplitude Envelope
    aAmpEnv madsr 0.01, 0.2, 0.7, 0.3
    
    ; Filter Envelope (Using variable decay)
    iFiltDec i kFiltDecay
    aFiltEnv madsr 0.01, iFiltDec, 0.1, 0.1

    ; --- 5. DSP PROCESSING ---
    ; Combine manual cutoff with envelope modulation
    ; We ensure cutoff doesn't go below 20Hz or above Nyquist
    kTotalCutoff limit kCutoff + (k(aFiltEnv) * kFiltEnvAmt), 20, 20000
    
    aFiltered moogladder aSig, kTotalCutoff, kRes

    ; --- 6. OUTPUT ---
    ; Apply envelope, velocity, and gain
    aOut = aFiltered * aAmpEnv * iAmp * kGain
    
    outch 1, aOut, 2, aOut
endin
</CsInstruments>
<CsScore>
; Plays from MIDI only: keep Csound running until the player stops it.
f 0 z
</CsScore>
</CsoundSynthesizer>
