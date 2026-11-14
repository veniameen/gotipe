# Site fonts

Self-hosted for the GoTipe website only (not shipped in any package).

| File | Font | Source | License |
|---|---|---|---|
| InterVariable.woff2, InterVariable-Italic.woff2 | Inter (variable, 100–900) | https://rsms.me/inter/ | SIL OFL 1.1, LICENSE-Inter.txt |
| JetBrainsMono-Regular.woff2, JetBrainsMono-Medium.woff2 | JetBrains Mono 400, 500 | https://github.com/JetBrains/JetBrainsMono | SIL OFL 1.1, LICENSE-JetBrainsMono.txt |

Downloaded 2026-11-14 with the owner's approval.

## Subsets of Inter

The full Inter files are large (352 KB upright, 388 KB italic), so the site preloads a subset and
lets `unicode-range` fetch the rest only when a page needs it (`styles/fonts.css`). Made on
2026-11-14 with the local fontTools 4.60.2 (`pyftsubset`, default layout features, both variable
axes `opsz` and `wght` kept), from the files above:

| File | Ranges | Size |
|---|---|---:|
| InterVariable-latin.woff2 (preloaded) | U+0000-017F (Basic Latin, Latin-1, Latin Extended-A), U+2000-206F (general punctuation), U+20AC, U+2122, U+2190-21FF (arrows), U+2212, U+2215, U+2318, U+2713, U+2715 | 78,432 B |
| InterVariable-cyrillic.woff2 | U+0400-04FF, U+2116 | 50,672 B |
| InterVariable-Italic-latin.woff2 | as the upright Latin subset | 86,496 B |
| InterVariable-Italic-cyrillic.woff2 | as the upright Cyrillic subset | 54,744 B |

```sh
LAT="U+0000-017F,U+2000-206F,U+20AC,U+2122,U+2190-21FF,U+2212,U+2215,U+2318,U+2713,U+2715"
CYR="U+0400-04FF,U+2116"
for f in InterVariable InterVariable-Italic; do
  python3 -m fontTools.subset $f.woff2 --unicodes="$LAT" --flavor=woff2 --output-file=$f-latin.woff2
  python3 -m fontTools.subset $f.woff2 --unicodes="$CYR" --flavor=woff2 --output-file=$f-cyrillic.woff2
done
```

LICENSE-Inter.txt declares no Reserved Font Name, so the subsets (Modified Versions under OFL
1.1) keep the name Inter; the licence file covers them as well. The full files stay as the
fallback for characters outside both subsets.

## Subsets of JetBrains Mono

The mono labels stand in the first screen of every page, so the regular weight's Latin subset is
preloaded too. Same tool and the same Latin ranges as Inter:

| File | Ranges | Size |
|---|---|---:|
| JetBrainsMono-Regular-latin.woff2 (preloaded) | as Inter's Latin subset | 34,432 B |
| JetBrainsMono-Medium-latin.woff2 | as Inter's Latin subset | 35,200 B |

```sh
for f in JetBrainsMono-Regular JetBrainsMono-Medium; do
  python3 -m fontTools.subset $f.woff2 --unicodes="$LAT" --flavor=woff2 --output-file=$f-latin.woff2
done
```

LICENSE-JetBrainsMono.txt declares no Reserved Font Name either; the full files stay the fallback.
