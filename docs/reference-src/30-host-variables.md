## JavaScript host variables

A `js` cell is an Observable Runtime cell. The host injects the variables
below into the module scope before any cell runs. None of them crosses IPC
from inside cell code — the host resolves every one ahead of time and feeds
the results in, which is why a cell never awaits the engine.

| Variable | Shape |
|---|---|
| one per `math` definition, **by name** | `{ length, t, v }` for a time-axis definition. A rank-0 value binds a bare number; a rank-1 value on some other axis binds that axis's key instead of `t`; a rank ≥ 2 value binds `{ shape, axes, v }`. |
| `channel(name, opts?)` | `{ length, t, v, w }` plus a `windows` descriptor. `opts` takes `{ lap }` and `{ session }`. |
| `spectrum(name, params)` | The FFT payload for a channel, keyed by `spectrumKey(channelId, fftParams)`. |
| `histogram(name, params)` | The binned payload for a channel. |
| `scatter(xChannel, yChannel, params)` | The point cloud for a channel pair. |
| `laps` | `{ number, startT, endT }[]` for the active session. |
| `session` | `{ id, name?, timestampUtcMs }`. |
| `constants` | `{ [name]: number }` — front matter and every `const` line, flattened. Keys may contain spaces. |
| `Plot` | `@observablehq/plot` 0.6.17, bundled. |
| `d3` | `d3` 7.9.0, bundled. |
| `Inputs` | `@observablehq/inputs` 0.12.0, bundled. |
| `html` | The standard tagged-template helper. |

Every library is bundled with the app. There is no CDN, ever, so a cell that
reaches for a URL will not load.

### The column layout

`{ length, t, v }` is column-oriented (struct-of-arrays), which is Observable
Plot's own tabular-data protocol. That is what lets a mark address columns by
name with no copy:

```js
Plot.plot({
  marks: [Plot.lineY(channel("front_travel"), { x: "t", y: "v" })]
})
```

The arrays are typed-array views over the bytes the engine transferred, so
mutating them is not a supported thing to do.

### Units on a channel

A `channel(...)` result carries its unit as two **non-enumerable** properties,
so neither appears in a `for...of` over the samples nor in Plot's column
inference:

| Property | Meaning |
|---|---|
| `.unit` | The unit as text, ready to splice into prose. Empty when the value is dimensionless. |
| `.unitState` | `"known"`, `"dimensionless"` or `"unknown"`. |

The unit comes from whichever source resolved the value — a definition's own
result, or a raw channel's recorded unit. It never comes from the transferred
sample bytes, which carry samples and framing only.

### Colouring by window

`w` is an index into `windows`, so a multi-window chart colours itself by
stroking on `"w"` and building the range from each window's own colour token:

```js
Plot.plot({
  color: { legend: true },
  marks: [Plot.lineY(channel("front_travel"), { x: "tr", y: "v", stroke: "w" })]
})
```
