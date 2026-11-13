<CsoundSynthesizer>
<CsOptions>
-odac
</CsOptions>
<CsInstruments>
;<@INSTRUMENT: {name: "Level Meter"; date: "2026-05"; description: "Csound sends values back to the page: a meter and a text label show the output level (chnset)."; tags: "basics, chnset"}>

sr = 48000
ksmps = 64
nchnls = 2
0dbfs = 1

instr 1
    ; --- WIDGET PARAMETERS ---
    ; Frequency on a logarithmic scale for natural pitch perception
    k_freq = chnget("freq") ; <@WIDGET knob:{id: "knob_001"; label: "Frequency [Hz]"; range: 40-1000; default: 220; scale: "logarithmic"}>

    ; Amplitude in decibels (dB), from -60 to 0
    k_ampDb = chnget("amp") ; <@WIDGET slider:{id: "slider_001"; label: "Amplitude [dB]"; range: -60-0; default: -3}>

    ; Convert decibels to linear amplitude
    k_amp = ampdb(k_ampDb)

    ; --- SIGNAL GENERATION ---
    a_out = vco2(k_amp, k_freq)

    ; --- SENDING VALUES TO THE PAGE ---
    ; The Root Mean Square (average level) of the signal, at k-rate
    k_rms = rms(a_out)

    ; chnset writes a channel the page reads: a meter widget draws it as a bar...
    chnset(k_rms, "rms") ; <@WIDGET meter:{id: "meter_001"; label: "Root Mean Square"; default: 0.5}>

    ; ...and a label widget on a chnset line prints it as text. {value} marks
    ; where the number goes; decimals sets how many digits follow the point.
    chnset(k_rms, "rms_text") ; <@WIDGET label:{id: "label_rms"; text: "RMS: {value}"; decimals: 3}>

    out(a_out, a_out)
endin
</CsInstruments>
<CsScore>
; Keep instr 1 running until the player stops it.
i 1 0 z
</CsScore>
</CsoundSynthesizer>
