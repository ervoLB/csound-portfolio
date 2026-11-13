<CsoundSynthesizer>
<CsOptions>
-odac
</CsOptions>
<CsInstruments>
;<@INSTRUMENT: {name: "Dropdown Modulations"; date: "2025-06"; description: "Pick the carrier and modulator waveforms and the modulation type (AM, ring or FM) from dropdowns."; tags: "modulation, synth, basics"}>

sr = 48000
ksmps = 64
nchnls = 2
0dbfs = 1

instr 1
    ; --- DROPDOWN WIDGETS ---
    ; Dropdown options are written as Label=Value; Label2=Value2
    k_oscWave = chnget("osc_wave") ; <@WIDGET dropdown:{id: "drop_osc"; label: "Osc Waveform"; options: "Sine=0; Saw=1; Square=2; Triangle=3"; default: 0}>
    k_modWave = chnget("mod_wave") ; <@WIDGET dropdown:{id: "drop_mod"; label: "Mod Waveform"; options: "Sine=0; Saw=1; Square=2; Triangle=3"; default: 0}>
    k_modType = chnget("mod_type") ; <@WIDGET dropdown:{id: "drop_type"; label: "Mod Target"; options: "Amp (AM)=0; Ring (RM)=1; Freq (FM)=2"; default: 0}>

    ; --- CONTINUOUS CONTROLS ---
    k_freq = chnget("freq") ; <@WIDGET knob:{id: "knob_freq"; label: "Osc Freq [Hz]"; range: 50-1000; default: 220; scale: "logarithmic"}>
    k_modFreq = chnget("mod_freq") ; <@WIDGET knob:{id: "knob_mod_freq"; label: "Mod Freq [Hz]"; range: 0.1-50; default: 5; scale: "logarithmic"}>
    k_modDepth = chnget("mod_depth") ; <@WIDGET knob:{id: "knob_depth"; label: "Mod Depth"; range: 0-1; default: 0.8}>

    ; --- MODULATOR GENERATION ---
    ; Using 'lfo' opcode to easily generate various k-rate waveforms
    k_mod = init(0)
    if (k_modWave == 1) then
        k_mod = lfo(1, k_modFreq, 5)   ; Saw-down
    elseif (k_modWave == 2) then
        k_mod = lfo(1, k_modFreq, 3)   ; Square
    elseif (k_modWave == 3) then
        k_mod = lfo(1, k_modFreq, 1)   ; Triangle
    else
        k_mod = lfo(1, k_modFreq, 0)   ; Sine
    endif

    ; --- MODULATION ROUTING ---
    k_actualAmp = init(1)
    k_actualFreq = init(440)

    if (k_modType == 1) then
        ; Ring Modulation (bipolar multiplication)
        k_actualAmp = k_mod * k_modDepth
        k_actualFreq = k_freq
    elseif (k_modType == 2) then
        ; Frequency Modulation (vibrato or low-index FM)
        ; Depth controls how much frequency deviates (up to 200 Hz)
        k_actualAmp = 1
        k_actualFreq = k_freq + (k_modDepth * 200 * k_mod)
    else
        ; Amplitude Modulation (unipolar)
        ; Convert bipolar k_mod (-1 to 1) into unipolar (0 to 1)
        k_uniMod = (k_mod * 0.5) + 0.5
        k_actualAmp = 1 - k_modDepth + (k_uniMod * k_modDepth)
        k_actualFreq = k_freq
    endif

    ; --- CARRIER GENERATION ---
    a_osc = init(0)
    if (k_oscWave == 1) then
        a_osc = vco2(k_actualAmp, k_actualFreq, 0)   ; Saw
    elseif (k_oscWave == 2) then
        a_osc = vco2(k_actualAmp, k_actualFreq, 10)  ; Square
    elseif (k_oscWave == 3) then
        a_osc = vco2(k_actualAmp, k_actualFreq, 12)  ; Triangle
    else
        a_osc = poscil(k_actualAmp, k_actualFreq)    ; Sine
    endif

    k_masterAmpDb = chnget("amp") ; <@WIDGET slider:{id: "slider_amp"; label: "Master Vol [dB]"; range: -60-0; default: -3}>

    ; Convert Master Vol from dB to linear amplitude
    k_masterAmp = ampdb(k_masterAmpDb)

    a_out = a_osc * k_masterAmp
    out(a_out, a_out)
endin
</CsInstruments>
<CsScore>
; Keep instr 1 running until the player stops it.
i 1 0 z
</CsScore>
</CsoundSynthesizer>
