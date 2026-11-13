<CsoundSynthesizer>
<CsOptions>
-odac
</CsOptions>
<CsInstruments>
;<@INSTRUMENT: {name: "Grand Piano"; date: "2024-05"; description: "Physical-model piano: hammer-excited string trichords, soundboard resonances and reverb. Play it from the keyboard or the button."; tags: "physical model, piano, midi"}>

sr = 48000
ksmps = 64
nchnls = 2
0dbfs = 1

; Route MIDI to instr 2
massign 0, 2

; --- GLOBAL UI CONTROL ---
instr 1
    ; GUI Widgets
    kHardness chnget "hardness" ; <@WIDGET knob:{id: "knob-hardness"; channel: "hardness"; label: "Hardness"; range: 500-15000; default: 6000; step: 1; showValue: true}>
    kSustain  chnget "sustain" ; <@WIDGET knob:{id: "knob-sustain"; channel: "sustain"; label: "Sustain"; range: 0.1-5; default: 2; step: 0.01; showValue: true}>
    kStiffness chnget "stiffness" ; <@WIDGET knob:{id: "knob-stiffness"; channel: "stiffness"; label: "Stiffness"; range: 0.001-0.8; default: 0.1; step: 0.001; showValue: true}>
    kDetune   chnget "detune" ; <@WIDGET knob:{id: "knob-detune"; channel: "detune"; label: "Detune"; range: 0-0.5; default: 0.05; step: 0.001; showValue: true}>
    kBody     chnget "body" ; <@WIDGET knob:{id: "knob-body"; channel: "body"; label: "Body Res"; range: 0-1; default: 0.3; step: 0.01; showValue: true}>
    kRevMix   chnget "reverb" ; <@WIDGET knob:{id: "knob-reverb"; channel: "reverb"; label: "Reverb"; range: 0-1; default: 0.2; step: 0.01; showValue: true}>
    kTrigger  chnget "trig" ; <@WIDGET button:{id: "button-trig"; channel: "trig"; label: "PLAY C-NOTE"; mode: "momentary"}>

    if changed(kTrigger) == 1 && kTrigger == 1 then
        event "i", 2, 0, 4, 60, 100
    endif
endin

; --- PIANO VOICE ---
instr 2
    ; 1. INPUT HANDLING
    iNote init p4
    if iNote == 0 then
        iNote notnum
    endif
    
    iVelRaw init p5
    if iVelRaw == 0 then
        iVelRaw veloc
    endif
    iVel = iVelRaw / 127
    
    iFreq = cpsmidinn(iNote)
    iPeriod = 1/iFreq

    ; Capture UI parameters at Note-On for i-rate opcodes
    iHardness chnget "hardness"
    iSusParam chnget "sustain"
    iStiff    chnget "stiffness"
    iDetune   chnget "detune"
    iBody     chnget "body"
    iRevMix   chnget "reverb"

    ; 2. EXCITATION (HAMMER)
    aPulse mpulse 1, 0
    aNoise noise 0.2, 0
    aEnvStrike linseg 1, 0.003, 0 
    
    aExcitation = (aPulse + aNoise) * aEnvStrike * iVel
    
    ; Hammer felt thickness (LPF) - using i-time capture for base
    iFeltBase = iHardness * (0.4 + iVel*0.6)
    aExcitation butlp aExcitation, iFeltBase

    ; 3. STRING MODEL (TRICHORD WITH INHARMONICITY)
    ; Frequencies for the three strings in the piano trichord
    iD1 = iPeriod
    iD2 = 1 / (iFreq + iDetune)
    iD3 = 1 / (iFreq - iDetune)
    
    ; Feedback coefficient for sustain
    kFb = pow(0.001, iPeriod / iSusParam)

    ; Initialize feedback variables to avoid T_IDENT errors
    aS1_ap1 init 0
    aS2_ap1 init 0
    aS3_ap1 init 0

    ; String 1
    aDel1 delayr 1.0
    aS1_sig deltapi iD1
    ; All-pass filter for inharmonicity (stiffness loop time must be i-rate)
    kCoefs[] init 2
    kCoefs[0] = 0.5
    kCoefs[1] = 0.01 * iStiff
    
    aS1_ap1 allpole aS1_sig, kCoefs
    delayw aExcitation + (aS1_ap1 * kFb)
    
    ; String 2
    aDel2 delayr 1.0
    aS2_sig deltapi iD2
    kCoefs[1] = 0.011 * iStiff
    aS2_ap1 allpole aS2_sig, kCoefs
    delayw aExcitation + (aS2_ap1 * kFb)

    ; String 3
    aDel3 delayr 1.0
    aS3_sig deltapi iD3
    kCoefs[1] = 0.009 * iStiff
    aS3_ap1 allpole aS3_sig, kCoefs
    delayw aExcitation + (aS3_ap1 * kFb)

    aStrings = (aS1_ap1 + aS2_ap1 + aS3_ap1) * 0.3

    ; 4. SOUNDBOARD RESONANCE
    ; Static resonances of the piano body (Mode filters)
    aB1 mode aStrings, 110, 15
    aB2 mode aStrings, 205, 10
    aB3 mode aStrings, 390, 8
    aB4 mode aStrings, 600, 5
    aSoundboard = (aB1 + aB2 + aB3 + aB4) * 0.15
    
    ; Mix strings and body based on UI
    aMixed = (aStrings * (1 - iBody)) + (aSoundboard * iBody)

    ; 5. DAMPING / ENVELOPE
    ; Quick release when key is let go
    aRelEnv linsegr 0, 0.005, 1, 0.1, 0
    aFinal = aMixed * aRelEnv

    ; 6. EFFECTS & OUTPUT
    ; Stereo spread based on note position (Piano keyboard layout)
    iPan = (iNote - 21) / 88 
    aL, aR pan2 aFinal, iPan
    
    ; Reverb section
    aRL, aRR freeverb aL, aR, 0.85, 0.5
    
    out (aL * (1-iRevMix)) + (aRL * iRevMix), (aR * (1-iRevMix)) + (aRR * iRevMix)
endin
</CsInstruments>
<CsScore>
; Keep instr 1 (the control instrument) running until the player stops it.
i 1 0 z
</CsScore>
</CsoundSynthesizer>
