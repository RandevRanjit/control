# Bloom 2 colour: `python3 derive2.py` output

Maths: `../colour/bcol.py` (OKLab/OKLCH, WCAG 2.x, APCA-W3 0.0.98G-4g, Machado 2009 CVD at severity 1.0). Ramps are sampled at 1001 points, interpolated in OKLab, as in v1.

## A. Night ladder (re-based on `#2F2E2E`)

| Token | Hex | OKLCH L C h | was (v1) | was (Bloom 2, round 2) | WCAG vs field | APCA Lc vs field | WCAG vs deep | dE_OK to previous |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `occlusion` | `#060714` | 0.136 0.029 277.6 | same | same | 1.48 | 0.0 | 1.15 |  |
| `deep` | `#1b1a1a` | 0.219 0.002  17.3 | none | `#131528` | 1.28 | 0.0 | 1.00 | 0.088 |
| `sunken` | `#242323` | 0.257 0.001  17.3 | `#0c0e1d` | `#1e2030` | 1.16 | 0.0 | 1.11 | 0.038 |
| `field` | `#2f2e2e` | 0.302 0.001  17.2 | `#131528` | same | 1.00 | 0.0 | 1.28 | 0.045 |
| `raised` | `#383737` | 0.338 0.001  17.2 | `#1b1e34` | same | 1.14 | 0.0 | 1.46 | 0.036 |
| `overlay` | `#424141` | 0.376 0.001  17.2 | `#252942` | same | 1.33 | 0.0 | 1.71 | 0.038 |
| `selection` | `#373f5b` | 0.373 0.049 271.6 | `#21294f` | same | 1.31 | 0.0 | 1.67 | 0.050 |
| `seam` | `#4f4e4e` | 0.425 0.001  17.2 | `#30354e` | same | 1.63 | -8.8 | 2.09 | 0.072 |
| `ghost` | `#767882` | 0.574 0.015 276.9 | `#5d627a` | same | 3.08 | -26.5 | 3.95 | 0.150 |
| `ink-4` | `#a9aebf` | 0.752 0.025 272.7 | `#979db4` | same | 6.12 | -53.9 | 7.85 | 0.178 |
| `ink-3` | `#c1c6d5` | 0.827 0.022 271.1 | `#b3b8cc` | same | 7.93 | -67.5 | 10.18 | 0.075 |
| `ink-2` | `#ebdcd5` | 0.905 0.019  46.8 | `#e2d2cb` | same | 10.14 | -82.4 | 13.01 | 0.086 |
| `cream` | `#dbc3c2` | 0.837 0.027  20.6 | same | same | 8.12 | -68.8 | 10.42 | 0.069 |
| `ink-1` | `#f5ebe4` | 0.946 0.014  57.6 | `#f2e9e2` | same | 11.53 | -91.2 | 14.79 | 0.110 |

- Surface steps vs field: deep 1.28, sunken 1.16, raised 1.14, overlay 1.33, selection 1.31, seam 1.63
- Field `#2F2E2E` chroma 0.001: neutral. Round 3: deep chroma 0.0016 and sunken 0.0015, the field's own grey; the one blue-black left is occlusion, and it is shading only (shadows and inset gradients, never a fill). Selection is the one blue surface that rises.
- The steps, by OKLCH L: deep 0.219 -> 0.257 -> 0.302 -> 0.338 -> 0.376 -> 0.425 (deep, sunken, field, raised, overlay, seam): even steps of 0.038, 0.045, 0.036, 0.038, 0.049.

## B. Text contrast (WCAG / APCA Lc); `!` = under the tier

Tiers as v1: body 7:1 and |Lc| 75; label 4.5 and 60; caption 4.5 and 45; emphasis (>= 13 px, weight >= 600) 4.5 and 45; disabled exempt.

### field

| Text \ surface | tier | field | raised | overlay | selection | sunken | amber-wash | amber-word |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ink-1` `#262b5b` | body | 9.84 / 80 | 10.91 / 86 | 11.75 / 91 | 11.37 / 89 | 9.21 / 76 | 11.03 / 87 | 9.27 / 76 |
| `ink-2` `#333964` | secondary | 8.14 / 76 | 9.02 / 82 | 9.71 / 87 | 9.40 / 85 | 7.61 / 72 | 9.12 / 83 | 7.66 / 72 |
| `ink-3` `#414970` | label | 6.44 / 70 | 7.14 / 77 | 7.69 / 81 | 7.44 / 79 | 6.03 / 66 | 7.22 / 77 | 6.07 / 67 |
| `ink-4` `#525a7c` | caption | 4.99 / 64 | 5.54 / 70 | 5.96 / 75 | 5.77 / 73 | 4.67 / 60 | 5.59 / 71 | 4.70 / 60 |
| `ghost` `#7d85a0` | disabled | 2.71 / 45 | 3.00 / 51 | 3.23 / 56 | 3.13 / 54 | 2.54 / 41 | 3.04 / 52 | 2.55 / 41 |
| `danger` `#9b3a20` | emphasis | 5.15 / 64 | 5.71 / 70 | 6.14 / 75 | 5.95 / 73 | 4.81 / 60 | 5.77 / 71 | 4.85 / 60 |

### night

| Text \ surface | tier | field | raised | overlay | selection | sunken | deep | amber-wash | rose-wash | green-wash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ink-1` `#f5ebe4` | body | 11.53 / -91 | 10.11 / -89 | 8.67 / -86 | 8.83 / -86 | 13.35 / -93 | 14.79 / -95 | 12.00 / -92 | 16.42 / -95 | 12.47 / -92 |
| `ink-2` `#ebdcd5` | body | 10.14 / -82 | 8.89 / -80 | 7.62 / -77 | 7.77 / -77 | 11.74 / -85 | 13.01 / -86 | 10.55 / -83 | 14.45 / -87 | 10.97 / -84 |
| `ink-3` `#c1c6d5` | label | 7.93 / -67 | 6.95 / -65 | 5.96 / -62 | 6.08 / -62 | 9.19 / -70 | 10.18 / -71 | 8.25 / -68 | 11.30 / -72 | 8.58 / -69 |
| `ink-4` `#a9aebf` | caption | 6.12 / -54 | 5.36 / -52 | 4.60 / -48 | 4.69 / -49 | 7.09 / -56 | 7.85 / -57 | 6.37 / -54 | 8.72 / -58 | 6.62 / -55 |
| `ghost` `#767882` | disabled | 3.08 / -26 | 2.70 / -24 | 2.32 / -21 | 2.36 / -21 | 3.57 / -29 | 3.95 / -30 | 3.21 / -27 | 4.39 / -31 | 3.33 / -28 |
| `cream` `#dbc3c2` | label | 8.12 / -69 | 7.12 / -66 | 6.10 / -63 | 6.22 / -64 | 9.40 / -71 | 10.42 / -72 | 8.45 / -69 | 11.57 / -73 | 8.78 / -70 |
| `blue-light` `#b3c3fc` | label | 7.82 / -67 | 6.85 / -64 | 5.88 / -61 | 5.99 / -62 | 9.05 / -69 | 10.03 / -70 | 8.13 / -67 | 11.14 / -71 | 8.46 / -68 |
| `green-light` `#b1d391` | label | 8.12 / -69 | 7.12 / -66 | 6.10 / -63 | 6.22 / -64 | 9.40 / -71 | 10.42 / -72 | 8.45 / -69 | 11.57 / -73 | 8.78 / -70 |
| `lilac-light` `#e0b7f3` | label | 7.89 / -67 | 6.91 / -65 | 5.93 / -62 | 6.04 / -62 | 9.13 / -69 | 10.12 / -71 | 8.21 / -68 | 11.24 / -71 | 8.53 / -68 |
| `rose-light` `#fcb1bf` | label | 7.85 / -67 | 6.88 / -65 | 5.90 / -62 | 6.02 / -62 | 9.09 / -69 | 10.07 / -70 | 8.17 / -68 | 11.19 / -71 | 8.49 / -68 |
| `danger` `#ea9d82` | emphasis | 6.22 / -55 | 5.45 / -52 | 4.67 / -49 | 4.76 / -50 | 7.20 / -57 | 7.97 / -58 | 6.47 / -55 | 8.86 / -59 | 6.72 / -56 |
| `amber-light` `#fde68a` | label | 10.87 / -87 | 9.53 / -85 | 8.17 / -82 | 8.33 / -82 | 12.59 / -89 | 13.94 / -91 | 11.31 / -88 | 15.48 / -91 | 11.76 / -88 |

## C. Lamps: ink tones only (non-text contrast, 3:1)

### field

| Lamp | token | hex | field | raised | overlay | selection | sunken |
| --- | --- | --- | --- | --- | --- | --- | --- |
| needs | `ink-1` | `#262b5b` | 9.84 | 10.91 | 11.75 | 11.37 | 9.21 |
| failed | `ink-1` | `#262b5b` | 9.84 | 10.91 | 11.75 | 11.37 | 9.21 |
| done | `ink-1` | `#262b5b` | 9.84 | 10.91 | 11.75 | 11.37 | 9.21 |
| working | `ink-2` | `#333964` | 8.14 | 9.02 | 9.71 | 9.40 | 7.61 |
| bg | `ink-2` | `#333964` | 8.14 | 9.02 | 9.71 | 9.40 | 7.61 |
| choose | `ink-3` | `#414970` | 6.44 | 7.14 | 7.69 | 7.44 | 6.03 |
| house | `ink-4` | `#525a7c` | 4.99 | 5.54 | 5.96 | 5.77 | 4.67 |
| outside | `ink-4` | `#525a7c` | 4.99 | 5.54 | 5.96 | 5.77 | 4.67 |
| idle | `ink-4` | `#525a7c` | 4.99 | 5.54 | 5.96 | 5.77 | 4.67 |
| gone | `ink-4` | `#525a7c` | 4.99 | 5.54 | 5.96 | 5.77 | 4.67 |

Working band (`ghost` `#7d85a0`) inside the working disc (`ink-2`): 3.00:1. Gone draws ink-4 at 35 %; its contrast is not a target (the row is going away).

### night

| Lamp | token | hex | field | raised | overlay | selection | sunken | deep |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| needs | `ink-1` | `#f5ebe4` | 11.53 | 10.11 | 8.67 | 8.83 | 13.35 | 14.79 |
| failed | `ink-1` | `#f5ebe4` | 11.53 | 10.11 | 8.67 | 8.83 | 13.35 | 14.79 |
| done | `ink-1` | `#f5ebe4` | 11.53 | 10.11 | 8.67 | 8.83 | 13.35 | 14.79 |
| working | `ink-2` | `#ebdcd5` | 10.14 | 8.89 | 7.62 | 7.77 | 11.74 | 13.01 |
| bg | `ink-2` | `#ebdcd5` | 10.14 | 8.89 | 7.62 | 7.77 | 11.74 | 13.01 |
| choose | `ink-3` | `#c1c6d5` | 7.93 | 6.95 | 5.96 | 6.08 | 9.19 | 10.18 |
| house | `ink-4` | `#a9aebf` | 6.12 | 5.36 | 4.60 | 4.69 | 7.09 | 7.85 |
| outside | `ink-4` | `#a9aebf` | 6.12 | 5.36 | 4.60 | 4.69 | 7.09 | 7.85 |
| idle | `ink-4` | `#a9aebf` | 6.12 | 5.36 | 4.60 | 4.69 | 7.09 | 7.85 |
| gone | `ink-4` | `#a9aebf` | 6.12 | 5.36 | 4.60 | 4.69 | 7.09 | 7.85 |

Working band (`ghost` `#767882`) inside the working disc (`ink-2`): 3.29:1. Gone draws ink-4 at 35 %; its contrast is not a target (the row is going away).

## D. Families used by the state bars, and amber (failed)

### field

| Token | Hex | OKLCH L C h | C max sRGB | C / max | dE_OK to arm | hue gap to arm | WCAG vs field | WCAG vs raised |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `bar-blue-l` | `#899ff3` | 0.720 0.125 271.8 | 0.145 | 86 % | 0.343 | 117.2 | 1.87 | 2.07 |
| `bar-blue-b` | `#5773e1` | 0.591 0.170 269.8 | 0.223 | 76 % | 0.342 | 119.2 | 3.14 | 3.48 |
| `bar-blue-d` | `#3653c5` | 0.490 0.181 268.1 | 0.287 | 63 % | 0.360 | 120.9 | 4.86 | 5.38 |
| `bar-green-l` | `#93c35e` | 0.761 0.141 130.2 | 0.205 | 69 % | 0.351 | 101.2 | 1.52 | 1.69 |
| `bar-green-b` | `#5da12a` | 0.640 0.165 134.9 | 0.187 | 88 % | 0.323 | 105.9 | 2.36 | 2.61 |
| `bar-green-d` | `#397f19` | 0.531 0.150 138.1 | 0.164 | 91 % | 0.310 | 109.1 | 3.68 | 4.08 |
| `amber-light` | `#f0d565` | 0.874 0.135  95.9 | 0.180 | 75 % | 0.379 | 66.9 | 1.08 | 1.20 |
| `amber-base` | `#e4b125` | 0.786 0.152  86.3 | 0.161 | 95 % | 0.296 | 57.3 | 1.46 | 1.62 |
| `amber-deep` | `#c6911d` | 0.690 0.135  80.8 | 0.143 | 95 % | 0.220 | 51.8 | 2.08 | 2.31 |
| `amber-wash` | `#f4eac4` | 0.935 0.051  95.0 | 0.103 | 49 % | 0.430 | 66.0 | 1.12 | 1.01 |
| `amber-word` | `#f0d680` | 0.879 0.110  93.1 | 0.176 | 63 % | 0.379 | 64.1 | 1.06 | 1.18 |
| `arm` | `#d90e0b` | 0.559 0.225  29.0 | 0.229 | 98 % | 0.000 | 0.0 | 3.87 | 4.29 |
| `arm-deep` | `#861118` | 0.399 0.150  25.2 | 0.162 | 92 % | 0.177 | 3.8 | 7.38 | 8.18 |
| `bar-lilac-l` | `#d1a9e3` | 0.790 0.091 315.2 | 0.157 | 58 % | 0.317 | 73.8 | 1.48 | 1.64 |
| `bar-lilac-b` | `#b283c7` | 0.680 0.110 315.0 | 0.251 | 44 % | 0.252 | 74.0 | 2.23 | 2.47 |
| `bar-lilac-d` | `#8f5da4` | 0.560 0.119 315.4 | 0.276 | 43 % | 0.223 | 73.6 | 3.64 | 4.03 |
| `wine` | `#5c2b40` | 0.362 0.076 354.6 | 0.149 | 51 % | 0.259 | 34.4 | 8.29 | 9.19 |
| `navy` | `#262b5b` | 0.312 0.085 275.9 | 0.195 | 44 % | 0.366 | 113.1 | 9.84 | 10.91 |
| `cream` | `#dbc3c2` | 0.837 0.027  20.6 | 0.090 | 30 % | 0.341 | 8.4 | 1.23 | 1.37 |

### night

| Token | Hex | OKLCH L C h | C max sRGB | C / max | dE_OK to arm | hue gap to arm | WCAG vs field | WCAG vs raised |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `bar-blue-l` | `#a4b7fa` | 0.790 0.098 271.8 | 0.106 | 92 % | 0.310 | 116.7 | 6.92 | 6.06 |
| `bar-blue-b` | `#6d8bf8` | 0.665 0.165 269.9 | 0.177 | 93 % | 0.336 | 118.7 | 4.32 | 3.79 |
| `bar-blue-d` | `#4768db` | 0.556 0.180 268.0 | 0.244 | 74 % | 0.367 | 120.5 | 2.75 | 2.41 |
| `bar-green-l` | `#b0dc75` | 0.841 0.140 128.1 | 0.220 | 64 % | 0.335 | 99.6 | 8.60 | 7.54 |
| `bar-green-b` | `#7cc74b` | 0.755 0.175 135.0 | 0.221 | 79 % | 0.335 | 106.5 | 6.53 | 5.72 |
| `bar-green-d` | `#449a2f` | 0.611 0.165 140.0 | 0.197 | 84 % | 0.328 | 111.5 | 3.81 | 3.34 |
| `amber-light` | `#fde68a` | 0.924 0.115  95.7 | 0.125 | 92 % | 0.335 | 67.2 | 10.87 | 9.53 |
| `amber-base` | `#fccf47` | 0.871 0.155  90.0 | 0.167 | 93 % | 0.291 | 61.4 | 9.13 | 8.00 |
| `amber-deep` | `#eeb32f` | 0.801 0.152  82.3 | 0.165 | 92 % | 0.229 | 53.7 | 7.17 | 6.29 |
| `amber-wash` | `#302b1f` | 0.291 0.022  88.0 | 0.059 | 37 % | 0.429 | 59.5 | 1.04 | 1.19 |
| `amber-word` | `#473c24` | 0.361 0.041  85.8 | 0.074 | 55 % | 0.365 | 57.3 | 1.25 | 1.10 |
| `arm` | `#ff4438` | 0.662 0.225  28.5 | 0.225 | 100 % | 0.000 | 0.0 | 3.96 | 3.47 |
| `arm-deep` | `#c22823` | 0.531 0.191  27.9 | 0.217 | 88 % | 0.136 | 0.6 | 2.33 | 2.05 |
| `bar-lilac-l` | `#e1c0f0` | 0.851 0.074 315.2 | 0.108 | 69 % | 0.287 | 73.3 | 8.38 | 7.35 |
| `bar-lilac-b` | `#d0a4e4` | 0.780 0.101 315.0 | 0.165 | 61 % | 0.248 | 73.5 | 6.52 | 5.71 |
| `bar-lilac-d` | `#b481cb` | 0.680 0.119 314.9 | 0.250 | 48 % | 0.223 | 73.7 | 4.48 | 3.92 |
| `wine` | `#5c2b40` | 0.362 0.076 354.6 | 0.149 | 51 % | 0.343 | 34.0 | 1.21 | 1.06 |
| `navy` | `#2a2f63` | 0.330 0.091 276.1 | 0.206 | 44 % | 0.429 | 112.4 | 1.09 | 1.05 |
| `cream` | `#dbc3c2` | 0.837 0.027  20.6 | 0.090 | 30 % | 0.264 | 8.0 | 8.12 | 7.12 |

### amber against its neighbours

| Pair | field dE_OK | night dE_OK | field protan / deutan / tritan | night protan / deutan / tritan |
| --- | --- | --- | --- | --- |
| `amber-base` / `arm` | 0.296 | 0.291 | 0.328 / 0.220 / 0.236 | 0.309 / 0.204 / 0.288 |
| `amber-deep` / `arm` | 0.220 | 0.229 | 0.229 / 0.123 / 0.167 | 0.232 / 0.136 / 0.221 |
| `amber-base` / `bar-green-b` | 0.196 | 0.172 | 0.094 / 0.159 / 0.227 | 0.069 / 0.127 / 0.178 |
| `amber-light` / `bar-green-l` | 0.139 | 0.112 | 0.083 / 0.122 / 0.155 | 0.055 / 0.088 / 0.106 |
| `amber-deep` / `bar-green-d` | 0.211 | 0.244 | 0.106 / 0.172 / 0.243 | 0.133 / 0.206 / 0.275 |
| `amber-base` / `id-butter` | 0.174 | 0.129 | 0.160 / 0.177 / 0.172 | 0.122 / 0.131 / 0.097 |
| `amber-light` / `id-butter` | 0.257 | 0.167 | 0.256 / 0.259 / 0.252 | 0.166 / 0.167 / 0.152 |
| `amber-deep` / `id-butter` | 0.080 | 0.076 | 0.063 / 0.082 / 0.083 | 0.069 / 0.077 / 0.068 |
| `amber-base` / `danger` | 0.329 | 0.158 | 0.352 / 0.311 / 0.312 | 0.163 / 0.136 / 0.104 |
| `amber-deep` / `danger` | 0.234 | 0.109 | 0.253 / 0.214 / 0.218 | 0.112 / 0.090 / 0.038 |
| `arm-deep` / `danger` | 0.086 | 0.253 | 0.097 / 0.083 / 0.068 | 0.295 / 0.230 / 0.238 |

- field: amber hues 80.8-95.9; nearest to arm's moat edge (55) by 25.8 deg
- night: amber hues 82.3-95.7; nearest to arm's moat edge (55) by 27.3 deg

## E. State bars: one smooth ramp per state, inside its family

Round 3 (the owner: "I can clearly see bands of colours rather than smooth colours that flow"): a state bar stays inside one family, so it blends. One tile is a smooth wave in OKLab: base at 0, light at 1/4, base at 1/2, deep at 3/4, back to base; weights from s = sin 2 pi x (light max(s, 0), deep max(-s, 0), base 1 - |s|), so it never passes a key colour. Needs-you is a cosine between arm and arm-deep. Housekeeping blends the safe ramp's keys the same way. No cream, no navy, no wine inside a bar: the bridges now play only when a bar changes state (the wipe crosses families, so it bridges). CSS stops every 5 %, sampled in OKLab; the browser's sRGB blend between neighbours stays on the curve.

### field

| State | base | light | deep | shares (nearest key) | seam dE | lum ratio | max C | min dE to arm (P3) | min dE to cream / navy | max dE per 2 px: tip / compact / full (was, compact) | base vs field | base vs raised | base vs sunken |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| working | `#5773e1` | `#899ff3` | `#3653c5` | base 33 %, deep 34 %, light 33 % | 0.0000 | 2.60 | 0.181 | 0.335 (0.359) | 0.180 / 0.203 | 0.0152 / 0.0092 / 0.0061 (0.090) | 3.14 | 3.48 | 2.94 |
| done | `#5da12a` | `#93c35e` | `#397f19` | base 34 %, deep 33 %, light 33 % | 0.0000 | 2.42 | 0.165 | 0.309 (0.333) | 0.170 / 0.311 | 0.0182 / 0.0103 / 0.0072 (0.125) | 2.36 | 2.61 | 2.20 |
| failed | `#e4b125` | `#f0d565` | `#c6911d` | base 34 %, deep 33 %, light 33 % | 0.0000 | 1.93 | 0.152 | 0.220 (0.234) | 0.133 / 0.437 | 0.0147 / 0.0085 / 0.0063 (0.175) | 1.46 | 1.62 | 1.37 |
| choose | `#b283c7` | `#d1a9e3` | `#8f5da4` | base 33 %, deep 33 %, light 33 % | 0.0000 | 2.46 | 0.119 | 0.223 (0.248) | 0.096 / 0.260 | 0.0131 / 0.0085 / 0.0066 (0.076) | 2.23 | 2.47 | 2.09 |
| house | `#333964` | `#305d12` | `#2b44a6` | base 33 %, deep 33 %, light 33 % | 0.0000 | 1.41 | 0.160 | 0.302 (0.328) | 0.426 / 0.050 | 0.0220 / 0.0125 / 0.0085 (0.017) | 8.14 | 9.02 | 7.61 |
| needs | `#d90e0b` | (arm) | `#861118` | base 50 %, deep 50 % | 0.0000 | 1.91 | 0.225 | the arm bar | 0.341 / 0.214 | 0.0196 / 0.0108 / 0.0066 (0.236) | 3.87 | 4.29 | 3.62 |

### night

| State | base | light | deep | shares (nearest key) | seam dE | lum ratio | max C | min dE to arm (P3) | min dE to cream / navy | max dE per 2 px: tip / compact / full (was, compact) | base vs field | base vs raised | base vs sunken |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| working | `#6d8bf8` | `#a4b7fa` | `#4768db` | base 33 %, deep 33 %, light 33 % | 0.0000 | 2.51 | 0.180 | 0.309 (0.346) | 0.120 / 0.243 | 0.0158 / 0.0091 / 0.0061 (0.072) | 4.32 | 3.79 | 5.00 |
| done | `#7cc74b` | `#b0dc75` | `#449a2f` | base 33 %, deep 33 %, light 33 % | 0.0000 | 2.26 | 0.175 | 0.322 (0.357) | 0.150 / 0.368 | 0.0221 / 0.0124 / 0.0093 (0.146) | 6.53 | 5.72 | 7.56 |
| failed | `#fccf47` | `#fde68a` | `#eeb32f` | base 34 %, deep 33 %, light 33 % | 0.0000 | 1.52 | 0.155 | 0.229 (0.248) | 0.140 / 0.529 | 0.0109 / 0.0057 / 0.0053 (0.210) | 9.13 | 8.00 | 10.57 |
| choose | `#d0a4e4` | `#e1c0f0` | `#b481cb` | base 33 %, deep 33 %, light 33 % | 0.0000 | 1.87 | 0.119 | 0.223 (0.263) | 0.069 / 0.358 | 0.0115 / 0.0063 / 0.0055 (0.107) | 6.52 | 5.71 | 7.55 |
| house | `#dbc3c2` | `#a2ce72` | `#9cb0fb` | base 34 %, deep 33 %, light 33 % | 0.0000 | 1.26 | 0.129 | 0.263 (0.292) | 0.000 / 0.441 | 0.0166 / 0.0089 / 0.0064 (0.012) | 8.12 | 7.12 | 9.40 |
| needs | `#ff4438` | (arm) | `#c22823` | base 50 %, deep 50 % | 0.0000 | 1.69 | 0.225 | the arm bar | 0.264 / 0.312 | 0.0156 / 0.0091 / 0.0065 (0.166) | 3.96 | 3.47 | 4.58 |

- field: steepest 2 px step in any bar: tip 0.0220, compact 0.0125, full 0.0085 (round 2's template: 0.236 at compact, at a bridge). Luminance ratio within a bar 1.41-2.60:1 (was 6.72-10.01 with the bridges). Nearest a coloured bar comes to cream 0.096, to navy 0.203 (housekeeping is the safe ramp, whose own base is ink-2: it blends through it, it is not a separator).
- night: steepest 2 px step in any bar: tip 0.0221, compact 0.0124, full 0.0093 (round 2's template: 0.210 at compact, at a bridge). Luminance ratio within a bar 1.26-2.51:1 (was 6.72-10.01 with the bridges). Nearest a coloured bar comes to cream 0.069, to navy 0.243 (housekeeping is the safe ramp, whose own base is cream: it blends through it, it is not a separator).

## F. Colour-vision deficiency

Lamps carry no hue now, so CVD cannot touch them: shape and motion carry state for everyone. The bars add colour; their base plateaus, pairwise (Machado 2009, severity 1.0):

### field

| Pair | normal | protan | deutan | tritan | worst |
| --- | --- | --- | --- | --- | --- |
| needs / failed | 0.296 | 0.328 | 0.220 | 0.236 | 0.220 |
| needs / done | 0.323 | 0.234 | 0.065 | 0.310 | 0.065 |
| needs / working | 0.342 | 0.307 | 0.295 | 0.347 | 0.295 |
| needs / choose | 0.252 | 0.289 | 0.215 | 0.222 | 0.215 |
| failed / done | 0.196 | 0.094 | 0.159 | 0.227 | 0.094 |
| failed / working | 0.376 | 0.350 | 0.397 | 0.292 | 0.292 |
| failed / choose | 0.262 | 0.260 | 0.256 | 0.133 | 0.133 |
| done / working | 0.313 | 0.300 | 0.293 | 0.083 | 0.083 |
| done / choose | 0.278 | 0.220 | 0.184 | 0.126 | 0.126 |
| working / choose | 0.150 | 0.097 | 0.151 | 0.171 | 0.097 |

Lightness of the base plateaus (what survives every CVD): needs 0.559, failed 0.786, done 0.640, working 0.591, choose 0.680

### night

| Pair | normal | protan | deutan | tritan | worst |
| --- | --- | --- | --- | --- | --- |
| needs / failed | 0.291 | 0.309 | 0.204 | 0.288 | 0.204 |
| needs / done | 0.335 | 0.240 | 0.081 | 0.347 | 0.081 |
| needs / working | 0.336 | 0.278 | 0.294 | 0.365 | 0.278 |
| needs / choose | 0.248 | 0.272 | 0.213 | 0.261 | 0.213 |
| failed / done | 0.172 | 0.069 | 0.127 | 0.178 | 0.069 |
| failed / working | 0.380 | 0.357 | 0.398 | 0.276 | 0.276 |
| failed / choose | 0.254 | 0.256 | 0.245 | 0.093 | 0.093 |
| done / working | 0.326 | 0.313 | 0.306 | 0.119 | 0.119 |
| done / choose | 0.277 | 0.222 | 0.183 | 0.123 | 0.123 |
| working / choose | 0.165 | 0.113 | 0.167 | 0.194 | 0.113 |

Lightness of the base plateaus (what survives every CVD): needs 0.662, failed 0.871, done 0.755, working 0.665, choose 0.780

## G. Arm separation

### field: arm `#d90e0b`

| Token | Hex | where | dE_OK | hue gap | protan | deutan | tritan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `r-raspberry` | `#cd1f66` | hero ramp only | 0.096 | 25.2 | 0.119 | 0.088 | 0.050 |
| `rose-base` | `#b54b6a` | hero ramp only | 0.113 | 24.5 | 0.121 | 0.099 | 0.098 |
| `danger` | `#9b3a20` | two-red law | 0.121 | 6.8 | 0.029 | 0.093 | 0.139 |
| `id-rose` | `#b86c81` | pearl | 0.155 | 26.4 | 0.178 | 0.117 | 0.136 |
| `r-coral` | `#fc7392` | hero ramp only | 0.190 | 20.9 | 0.237 | 0.177 | 0.132 |
| `rose-deep` | `#7c2e45` | hero ramp only | 0.192 | 24.2 | 0.120 | 0.183 | 0.216 |
| `id-butter` | `#9e8337` | pearl | 0.205 | 60.5 | 0.171 | 0.052 | 0.183 |
| `amber-deep` | `#c6911d` | failed bar | 0.220 | 51.8 | 0.229 | 0.123 | 0.167 |
| `id-lilac` | `#9f72ad` | pearl | 0.222 | 71.0 | 0.234 | 0.185 | 0.206 |
| `bar-lilac-d` | `#8f5da4` | choose bar | 0.223 | 73.6 | 0.212 | 0.200 | 0.208 |
| `bar-lilac-b` | `#b283c7` | choose bar | 0.252 | 74.0 | 0.289 | 0.215 | 0.222 |
| `wine` | `#5c2b40` | bridge | 0.259 | 34.4 | 0.149 | 0.248 | 0.290 |
| `rose-light` | `#ef9cac` | chrome (diff mark) | 0.259 | 21.9 | 0.318 | 0.228 | 0.222 |
| `id-sage` | `#65955a` | pearl | 0.283 | 110.8 | 0.205 | 0.074 | 0.294 |
| `amber-base` | `#e4b125` | failed bar | 0.296 | 57.3 | 0.328 | 0.220 | 0.236 |
| `bar-green-d` | `#397f19` | done bar | 0.310 | 109.1 | 0.123 | 0.052 | 0.320 |
| `lilac-light` | `#d0a4e4` | chrome (agent) | 0.311 | 74.0 | 0.371 | 0.271 | 0.277 |
| `r-sage` | `#91b45e` | hero ramp only | 0.316 | 98.4 | 0.303 | 0.152 | 0.296 |
| `bar-lilac-l` | `#d1a9e3` | choose bar | 0.317 | 73.8 | 0.377 | 0.274 | 0.285 |
| `bar-green-b` | `#5da12a` | done bar | 0.323 | 105.9 | 0.234 | 0.065 | 0.310 |
| `bar-blue-b` | `#5773e1` | working bar | 0.342 | 119.2 | 0.307 | 0.295 | 0.347 |
| `bar-blue-l` | `#899ff3` | working bar | 0.343 | 117.2 | 0.366 | 0.278 | 0.342 |
| `bar-green-l` | `#93c35e` | done bar | 0.351 | 101.2 | 0.345 | 0.187 | 0.326 |
| `bar-blue-d` | `#3653c5` | working bar | 0.360 | 120.9 | 0.272 | 0.314 | 0.348 |
| `amber-light` | `#f0d565` | failed bar | 0.379 | 66.9 | 0.427 | 0.304 | 0.329 |

Closest chrome or bar token: `id-rose` 0.155. Closest bar token: `amber-deep` 0.220

### night: arm `#ff4438`

| Token | Hex | where | dE_OK | hue gap | protan | deutan | tritan |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `r-coral` | `#fe799b` | hero ramp only | 0.124 | 22.7 | 0.153 | 0.116 | 0.118 |
| `rose-base` | `#ed7d99` | hero ramp only | 0.126 | 23.3 | 0.149 | 0.112 | 0.129 |
| `r-raspberry` | `#cf2668` | hero ramp only | 0.134 | 24.5 | 0.137 | 0.136 | 0.059 |
| `rose-deep` | `#b94769` | hero ramp only | 0.147 | 23.7 | 0.111 | 0.148 | 0.104 |
| `danger` | `#ea9d82` | two-red law | 0.165 | 11.6 | 0.180 | 0.107 | 0.187 |
| `id-rose` | `#e299ac` | pearl | 0.178 | 26.1 | 0.200 | 0.140 | 0.196 |
| `id-butter` | `#c7af6d` | pearl | 0.221 | 61.6 | 0.200 | 0.093 | 0.237 |
| `bar-lilac-d` | `#b481cb` | choose bar | 0.223 | 73.7 | 0.211 | 0.202 | 0.214 |
| `rose-light` | `#fcb1bf` | chrome (diff mark) | 0.226 | 21.7 | 0.266 | 0.192 | 0.249 |
| `amber-deep` | `#eeb32f` | failed bar | 0.229 | 53.7 | 0.232 | 0.136 | 0.221 |
| `id-lilac` | `#c99fd6` | pearl | 0.233 | 70.5 | 0.247 | 0.194 | 0.248 |
| `bar-lilac-b` | `#d0a4e4` | choose bar | 0.248 | 73.5 | 0.272 | 0.213 | 0.261 |
| `lilac-light` | `#e0b7f3` | chrome (agent) | 0.278 | 73.6 | 0.315 | 0.239 | 0.297 |
| `bar-lilac-l` | `#e1c0f0` | choose bar | 0.287 | 73.3 | 0.325 | 0.241 | 0.313 |
| `id-sage` | `#93c089` | pearl | 0.289 | 111.4 | 0.232 | 0.110 | 0.326 |
| `r-sage` | `#98bd5e` | hero ramp only | 0.289 | 98.3 | 0.217 | 0.079 | 0.306 |
| `amber-base` | `#fccf47` | failed bar | 0.291 | 61.4 | 0.309 | 0.204 | 0.288 |
| `bar-blue-l` | `#a4b7fa` | working bar | 0.310 | 116.7 | 0.311 | 0.244 | 0.349 |
| `bar-green-d` | `#449a2f` | done bar | 0.328 | 111.5 | 0.100 | 0.071 | 0.340 |
| `bar-green-b` | `#7cc74b` | done bar | 0.335 | 106.5 | 0.240 | 0.081 | 0.347 |
| `bar-green-l` | `#b0dc75` | done bar | 0.335 | 99.6 | 0.311 | 0.167 | 0.356 |
| `amber-light` | `#fde68a` | failed bar | 0.335 | 67.2 | 0.365 | 0.253 | 0.353 |
| `bar-blue-b` | `#6d8bf8` | working bar | 0.336 | 118.7 | 0.278 | 0.294 | 0.365 |
| `wine` | `#5c2b40` | bridge | 0.343 | 34.0 | 0.237 | 0.340 | 0.320 |
| `bar-blue-d` | `#4768db` | working bar | 0.367 | 120.5 | 0.257 | 0.337 | 0.358 |

Closest chrome or bar token: `id-rose` 0.178. Closest bar token: `bar-lilac-d` 0.223

## H. Hero ramp and safe ramp

### field: hero ramp

- sage `#91b45e` (0.724 0.120 127.4), was `#98b076` (0.724 0.084 126.7); dE 0.036; C / sRGB max 64 %
- shares: blue 25.0 %, cream 11.5 %, green 27.6 %, navy 8.0 %, red 28.0 %; seam dE 0.0000
- closest approach to arm: sRGB 0.094 at 11.1 % (`#cf2367`), P3 0.110

```css
--ramp: #cd1f66 0%, #cd1f66 11%, #fc7392 14%, #fc7392 25%, #dbc3c2 28%, #dbc3c2 31%, #91b45e 34%, #91b45e 45%, #539624 48%, #539624 58%, #dbc3c2 61%, #dbc3c2 64%, #8ba0f1 67%, #8ba0f1 77%, #3d5ad9 80%, #3d5ad9 89%, #262b5b 92%, #262b5b 97%, #cd1f66 100%;
```

### field: safe ramp v2

- stops `#333964` / `#305d12` (0.430 0.115 135.8) / `#2b44a6` (0.430 0.160 268.0)
- luminance ratio 1.41:1, max C 0.160, min dE to arm 0.302 (P3 0.328), min WCAG vs field 5.75:1

```css
--ramp-safe: #333964 0%, #333964 8%, #305d12 20%, #305d12 38%, #333964 50%, #333964 58%, #2b44a6 70%, #2b44a6 88%, #333964 100%;
```

### night: hero ramp

- sage `#98bd5e` (0.750 0.130 126.9), was `#9dba74` (0.750 0.100 127.0); dE 0.030; C / sRGB max 67 %
- shares: blue 25.0 %, cream 11.3 %, green 27.6 %, navy 8.0 %, red 28.2 %; seam dE 0.0000
- closest approach to arm: sRGB 0.092 at 12.7 % (`#ea5984`), P3 0.128

```css
--ramp: #cf2668 0%, #cf2668 11%, #fe799b 14%, #fe799b 25%, #dbc3c2 28%, #dbc3c2 31%, #98bd5e 34%, #98bd5e 45%, #5ea130 48%, #5ea130 58%, #dbc3c2 61%, #dbc3c2 64%, #8fa5fa 67%, #8fa5fa 77%, #4765e8 80%, #4765e8 89%, #2a2f63 92%, #2a2f63 97%, #cf2668 100%;
```

### night: safe ramp v2

- stops `#dbc3c2` / `#a2ce72` (0.799 0.129 129.8) / `#9cb0fb` (0.771 0.110 272.2)
- luminance ratio 1.26:1, max C 0.129, min dE to arm 0.263 (P3 0.292), min WCAG vs field 6.46:1

```css
--ramp-safe: #dbc3c2 0%, #dbc3c2 8%, #a2ce72 20%, #a2ce72 38%, #dbc3c2 50%, #dbc3c2 58%, #9cb0fb 70%, #9cb0fb 88%, #dbc3c2 100%;
```

## I. Material: the Night rim, pearls, the primary pill's key hint

| Night rim mix | vs field | vs raised | vs deep |
| --- | --- | --- | --- |
| 0.45 | 2.31-2.69 | 2.02-2.36 | 2.96-3.45 |
| 0.55 | 3.03-3.39 | 2.66-2.97 | 3.89-4.35 |
| 0.60 | 3.44-3.80 | 3.01-3.33 | 4.41-4.87 |

Occluded edge = body under 85 % occlusion; rimmed = cream over it at the mix. Bodies: cobalt, raspberry, grass, id-butter, id-peri, amber-base, bar-blue-d, arm.

Field keeps 0.30: rimmed edge vs field 3.99-4.69:1.

- field: primary pill fill `#262b5b`, label `#d6deee` 9.84:1; key hint at .75 `#aab1c9` 6.23:1 (ledger 2 wants >= 3)
- night: primary pill fill `#f5ebe4`, label `#2f2e2e` 11.53:1; key hint at .75 `#605d5c` 5.56:1 (ledger 2 wants >= 3)

Count pearls: neutral body (`--puff`) with ink-1 digits:
- field: `#262b5b` on `#e3e9f4` 10.91 / 86
- night: `#f5ebe4` on `#424141` 8.67 / -86

Identity pearls vs the field (decorative, redundant with the name):
- field: 2.57-2.83:1
- night: 6.05-6.58:1

## J. Usage lines, selection, focus (Night)

Round 3: 5H and 7D are a thin rounded line in plain ink (`--use-ink` = ink-1) on the `--use-track` (sunken); no hue, no beads. Past 80 % only the leading end breathes. The session row's context line is the same line, 32 px, in ink-3 on the same track.

- field: usage ink-1 `#262b5b` vs track `#cdd7ed` 9.21:1; context ink-3 `#414970` vs track 6.03:1; track vs raised 1.18:1, vs overlay 1.28:1
- night: usage ink-1 `#f5ebe4` vs track `#242323` 13.35:1; context ink-3 `#c1c6d5` vs track 9.19:1; track vs raised 1.32:1, vs overlay 1.54:1

- focus `blue-light` `#b3c3fc`: field 7.82, raised 6.85, overlay 5.88, selection 5.99, sunken 9.05, deep 10.03
- selection `#373f5b`: vs raised 1.14, vs field 1.31; ink-1 on it 8.83 / -86
- needs tint: arm at 6 % over raised = `#443837`; ink-1 on it 9.58 / -88
- failed tint: amber-base at 6 % over raised = `#444038`; ink-1 on it 8.78 / -86

- Field needs tint: arm at 6 % over raised = `#e2dce6`; ink-1 on it 9.89 / 80
- Field failed tint: amber-base at 10 % over raised = `#e3e3df`; ink-1 on it 10.34 / 83

## M. State-bar motion

| State | period s | tile x | full px/s | compact px/s | tip px/s | beads px/s | band px/s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| needs | 1.75 | 0.5 | 102.9 | 68.6 | 34.3 | 137.1 | 137.1 |
| failed | 3.5 | 0.75 | 77.1 | 51.4 | 25.7 | 102.9 | 102.9 |
| done | 3.5 | 0.75 | 77.1 | 51.4 | 25.7 | 102.9 | 102.9 |
| working | 7 | 1 | 51.4 | 34.3 | 17.1 | 68.6 | 68.6 |
| bg | 7 | 1 | 51.4 | 34.3 | 17.1 | 68.6 | 68.6 |
| choose | 7 | 1 | 51.4 | 34.3 | 17.1 | 68.6 | 68.6 |
| house | 14 | 1 | 25.7 | 17.1 | 8.6 | 34.3 | 34.3 |

## L. v1 numbers that moved

- Night arm on the new field: 3.96:1 (v1 5.26 on #131528); on deep 5.07:1
- Night arm vs the new field under protan / deutan / tritan: 2.76 / 4.73 / 3.44
- Night arm vs danger (danger lifted to `#ea9d82`): dE 0.165 (v1 0.138); danger on field 6.22 / -55, on overlay 4.67 / -49
- Night rose-light `#fcb1bf` vs arm 0.226 (v1 0.197)
- Night ink-1 on field 11.53 / -91; on deep 14.79 / -95; CTRL's paper (v1 15.52 / -92.0)
- Night identity tints vs the new field: 6.05-6.58:1
- Theme switch lightness: Night field L 0.302 -> cream 0.837 -> Field 0.899; Field -> navy 0.312 -> Night 0.302
- Round 3 retires the blue-black wells: `--deep` `#131528` (0.204 0.038 277.9) -> `#1b1a1a` (0.219 0.002  17.3); `--sunken` `#1e2030` (0.249 0.030 278.4) -> `#242323` (0.257 0.001  17.3). Only `--occlusion` `#060714` stays blue-black, as shading.

## N. Terminal ANSI, in the well

| Slot | Night | WCAG / Lc in the well `#1b1a1a` | (was on #131528) | Field | WCAG / Lc on the field |
| --- | --- | --- | --- | --- | --- |
| 0 black | `#30354e` | 1.44 / 0 | 1.50 / 0 | `#262b5b` | 9.84 / 80 |
| 1 red | `#d98d73` | 6.62 / -50 | 6.87 / -50 | `#9b3a1f` | 5.15 / 64 |
| 2 green | `#99c77f` | 8.96 / -64 | 9.29 / -64 | `#32671c` | 5.03 / 64 |
| 3 yellow | `#d9c37f` | 9.98 / -70 | 10.35 / -70 | `#7d5e07` | 4.47 / 60 |
| 4 blue | `#99adf7` | 8.00 / -58 | 8.30 / -59 | `#354faa` | 5.45 / 66 |
| 5 magenta | `#ce9bdf` | 7.76 / -57 | 8.05 / -57 | `#77398a` | 5.68 / 67 |
| 6 cyan | `#76c8c7` | 8.98 / -64 | 9.31 / -65 | `#076b6f` | 4.65 / 61 |
| 7 white | `#e2d2cb` | 11.84 / -80 | 12.28 / -80 | `#414970` | 6.44 / 70 |
| 8 br black | `#979db4` | 6.45 / -48 | 6.69 / -49 | `#525a7c` | 4.99 / 64 |
| 9 br red | `#edac93` | 9.03 / -64 | 9.37 / -65 | `#892504` | 6.67 / 70 |
| 10 br green | `#bbe2a6` | 12.03 / -81 | 12.48 / -81 | `#265511` | 6.50 / 70 |
| 11 br yellow | `#ecdeaa` | 12.90 / -85 | 13.38 / -86 | `#694e00` | 5.78 / 67 |
| 12 br blue | `#bdccfd` | 10.93 / -75 | 11.34 / -75 | `#283f92` | 7.01 / 72 |
| 13 br magenta | `#e1c0ec` | 10.71 / -74 | 11.11 / -74 | `#642b74` | 7.26 / 73 |
| 14 br cyan | `#a6e1e0` | 11.96 / -80 | 12.41 / -81 | `#04585c` | 6.08 / 68 |
| 15 br white | `#f2e9e2` | 14.50 / -93 | 15.04 / -93 | `#262b5b` | 9.84 / 80 |

- Night slots 1-15 in the well: 6.45-14.50:1; slot 0 1.44:1 (the usual exception). Slot 9 vs arm: Night 0.199, Field 0.164.

## O. Diffs, in the well

### field: well `#d6deee` (L 0.899)

| Wash / word | hex | L - well L | dE to well | ink-1 on it | ink-2 on it | ink-4 on it | mark on it |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rose-wash` | `#e9c8cf` | -0.037 | 0.060 | 8.63 / 72 | 7.13 / 68 | 4.38 / 56 | 5.84 / 63 |
| `rose-word` | `#e7a8b6` | -0.105 | 0.134 | 6.76 / 60 | 5.59 / 55 | 3.43 / 43 | 4.57 / 50 |
| `green-wash` | `#dbefd1` | +0.030 | 0.070 | 10.94 / 86 | 9.05 / 82 | 5.55 / 70 | 6.70 / 75 |
| `green-word` | `#c8f2ae` | +0.015 | 0.117 | 10.62 / 85 | 8.78 / 80 | 5.39 / 68 | 6.51 / 73 |

- removed mark `#7c2e45` in the well 6.66 / 70; gutter (sunken) `#cdd7ed`: ink-4 4.67 / 60
- added mark `#2b5a17` in the well 6.03 / 68; gutter (sunken) `#cdd7ed`: ink-4 4.67 / 60
- removed vs added wash dE 0.101; under protan / deutan / tritan 0.097 / 0.071 / 0.093

### night: well `#1b1a1a` (L 0.219)

| Wash / word | hex | L - well L | dE to well | ink-1 on it | ink-2 on it | ink-4 on it | mark on it |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `rose-wash` | `#1d070e` | -0.049 | 0.063 | 16.42 / -95 | 14.45 / -87 | 8.72 / -58 | 11.19 / -71 |
| `rose-word` | `#450f23` | +0.051 | 0.097 | 13.29 / -93 | 11.69 / -84 | 7.06 / -55 | 9.05 / -69 |
| `green-wash` | `#1b2d17` | +0.056 | 0.073 | 12.47 / -92 | 10.97 / -84 | 6.62 / -55 | 8.78 / -70 |
| `green-word` | `#254519` | +0.135 | 0.157 | 9.20 / -87 | 8.09 / -78 | 4.88 / -49 | 6.48 / -64 |

- removed mark `#fcb1bf` in the well 10.07 / -70; gutter (sunken) `#242323`: ink-4 7.09 / -56
- added mark `#b1d391` in the well 10.42 / -72; gutter (sunken) `#242323`: ink-4 7.09 / -56
- removed vs added wash dE 0.132; under protan / deutan / tritan 0.135 / 0.106 / 0.129

## K. Flags

- Text under its tier (outside the diff washes): none
- Bar pairs under 0.06 in some simulation: none

