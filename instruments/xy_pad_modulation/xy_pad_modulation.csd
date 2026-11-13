<CsoundSynthesizer>
<CsOptions>
-odac
</CsOptions>
<CsInstruments>
;<@INSTRUMENT: {name: "XY Pad Modulation"; date: "2025-11"; description: "Three XY pads: carrier frequency and level, modulator frequency and level, and the ring/FM mix."; tags: "modulation, synth, basics"}>

sr = 48000
ksmps = 64
nchnls = 2
0dbfs = 1

gi_sine = ftgen(0, 0, 8192, 10, 1)

instr 1
    ; --- XY PADS ---
    ; The xy_pad widget binds to TWO channels. Place the meta-opcode on the first declaration.

    ; 1. Oscillator XY Pad (Controls Carrier Freq & Amp)
    k_oscFreq = chnget("osc_freq") ; <@WIDGET xy_pad:{id: "xy_osc"; label: "Oscillator (X:Freq, Y:Amp)"; channel_x_name: "osc_freq"; channel_y_name: "osc_amp"; range_x: 50-2000; range_y: 0-1; default_x: 440; default_y: 0.5}>
    k_oscAmp = chnget("osc_amp")

    ; 2. Modulator XY Pad (Controls Modulator Freq & Amp)
    k_modFreq = chnget("mod_freq") ; <@WIDGET xy_pad:{id: "xy_mod"; label: "Modulator (X:Freq, Y:Amp)"; channel_x_name: "mod_freq"; channel_y_name: "mod_amp"; range_x: 0.1-500; range_y: 0-1; default_x: 5; default_y: 0.8}>
    k_modAmp = chnget("mod_amp")

    ; 3. Modulation Mix XY Pad (Controls output routing balances)
    k_mixRing = chnget("mix_ring") ; <@WIDGET xy_pad:{id: "xy_mix"; label: "Mod Mix (X:Ring, Y:Freq)"; channel_x_name: "mix_ring"; channel_y_name: "mix_freq"; range_x: 0-1; range_y: 0-1; default_x: 0; default_y: 1}>
    k_mixFreq = chnget("mix_freq")

    ; --- SIGNAL GENERATION ---
    ; Generate modulator signal
    a_mod = poscil(k_modAmp, k_modFreq, gi_sine)

    ; 1. Carrier for Ring Modulation (standard carrier multiplied by modulator)
    a_carrier = poscil(k_oscAmp, k_oscFreq, gi_sine)
    a_ring = a_carrier * a_mod

    ; 2. Carrier for Frequency Modulation
    ; We multiply a_mod by a large depth (e.g., 500) so frequency deviation is highly audible
    a_freqMod = poscil(k_oscAmp, k_oscFreq + (a_mod * 500), gi_sine)

    ; --- MIXING ---
    ; Scale combinations of both modulations simultaneously using the Mix XY Pad
    a_out = (a_ring * k_mixRing) + (a_freqMod * k_mixFreq)

    out(a_out, a_out)
endin
</CsInstruments>
<CsScore>
; Keep instr 1 running until the player stops it.
i 1 0 z
</CsScore>
</CsoundSynthesizer>
