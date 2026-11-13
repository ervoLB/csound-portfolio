<CsoundSynthesizer>
<CsOptions>
-odac
</CsOptions>
<CsInstruments>
;<@INSTRUMENT: {name: "Vibrato Synth"; date: "2025-03"; description: "A sine oscillator with vibrato: the smallest instrument with controls."; tags: "basics, synth"}>

sr = 48000
ksmps = 64
nchnls = 2
0dbfs = 1

instr 1
    ; --- WIDGET PARAMETERS ---
    ; k_freq reads the knob's value from the "freq" channel.
    ; It uses a logarithmic scale for natural pitch perception.
    k_freq = chnget("freq") ; <@WIDGET knob:{id: "knob_001"; label: "Frequency [Hz]"; range: 100-1000; default: 440; scale: "logarithmic"}>

    ; Amplitude in decibels (dB), from -60 to 0
    k_ampDb = chnget("amp") ; <@WIDGET knob:{id: "knob_002"; label: "Amplitude [dB]"; range: -60-0; default: -3}>

    ; Depth of the vibrato in Hz
    k_vibDepth = chnget("vibDepth") ; <@WIDGET knob:{id: "knob_003"; label: "Vibrato Depth"; range: 0-20; default: 5}>

    ; --- SIGNAL GENERATION ---
    ; Convert decibels to linear amplitude
    k_amp = ampdb(k_ampDb)

    ; A 5 Hz LFO for the vibrato
    k_vib = oscili(k_vibDepth, 5)

    ; The sine oscillator, its frequency moved by the vibrato
    a_out = oscili(k_amp, k_freq + k_vib)

    out(a_out, a_out)
endin
</CsInstruments>
<CsScore>
; Keep instr 1 running until the player stops it.
i 1 0 z
</CsScore>
</CsoundSynthesizer>
