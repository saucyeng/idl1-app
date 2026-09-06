# idl1 UI design interview — questions for Isaac

Companion to `FLUTTER-UI-SURVEY.md`. These are the things the idl0 code cannot answer.
Nothing here is decided. 38 questions, grouped.

## A. The Flutter look — keep, kill, or restart (1–6)

1. Of the "quiet field manual" system, what do you actually love? Name the two or three
   things that must survive verbatim into idl1.
2. What has annoyed you about it in daily use? Anything you kept meaning to change and
   never did?
3. Is idl1 a faithful port of the visual language, a refinement of it, or a fresh start
   that only inherits the palette?
4. The near-black warm-green background `#121412` with warm off-white text is the single
   most distinctive choice. Locked, or open?
5. All-mono for data plus Plex Sans for prose: keep that split, or let idl1 use a real UI
   sans for chrome and reserve mono for numbers only?
6. The system has no logo, no wordmark and no imagery. Do you want a brand mark for idl1,
   or is the absence of one part of the point?

## B. Density, dark/light, and platform (7–13)

7. idl0 is dense by design — 6 px table rows, no instructional copy. Right density, or
   was that a phone-era compromise you would relax on desktop?
8. Should density be a user setting, or one fixed choice?
9. Dark-only, like idl0? Or does a light theme need to exist for daylight trailside use
   on a phone?
10. If light is in scope, is it a first-class design or a tolerable inversion?
11. Should idl1 follow the OS theme preference, or always look the same?
12. Desktop-first or mobile-first when the two conflict? The design doc calls desktop the
    authoring surface and mobile the primary device connection, but that does not settle
    layout priority.
13. Are touch targets sized for gloved hands outdoors, or is the phone a reading device
    where taps are rare?

## C. Shell and navigation (14–18)

14. idl1 has four tabs where idl0 had five, because Maths and Analyze merged into
    Notebook. Is that the final shape, or does Maths deserve its own surface again?
15. Which tab is the daily driver — the one that should open on launch and get the layout
    budget?
16. Bottom bar on narrow and a left rail on wide, as today? Or a persistent sidebar
    everywhere on desktop?
17. idl0 preserved every tab's state across switches. Worth the complexity in React, or
    is "reset on leave" acceptable for some tabs?
18. Do you want a global command palette or keyboard-first navigation, given the desktop
    authoring focus?

## D. Component library or hand-rolled (19–23)

19. The choice. Three candidates that satisfy React 19, bundled-offline, and small
    bundle, plus the hand-roll option:
    - **Radix Primitives** — headless and accessible, you own 100 % of the CSS so the
      field-manual look is unaffected. Solves dialog, popover, menu, tooltip, select,
      checkbox focus and keyboard behaviour. Cost: many small packages to pin, and its
      React 19 story is settled but you carry the upgrade.
    - **Base UI** — the MUI team's unstyled successor, one package, same headless deal,
      cleaner dependency surface than Radix. Cost: younger, smaller component set, more
      API churn ahead.
    - **Ark UI** — headless components over Zag state machines, strongest keyboard and
      accessibility behaviour of the three, framework-agnostic. Cost: largest conceptual
      surface, heaviest of the three.
    - **Hand-rolled CSS with tokens** — native `<dialog>`, `<details>`, the popover
      attribute, plain buttons. Zero dependencies, exactly the twelve components the
      survey lists, matches how the codebase is already written. Cost: you rebuild focus
      trapping, menu keyboard navigation and typeahead yourself, and get them subtly
      wrong for a while.
    Which of those four, and what is the deciding factor — bundle size, accessibility,
    control over appearance, or maintenance?
20. Any styled kit (Mantine, Chakra, shadcn/Tailwind) worth considering, accepting that
    its default look would have to be overridden heavily?
21. Plain CSS with custom properties, CSS Modules, or a utility framework? The repo is
    plain CSS with BEM-ish names today.
22. Accessibility bar: is keyboard-complete and screen-reader-correct a requirement, a
    nice-to-have, or explicitly out of scope for a single-user tool?
23. Is animation wanted at all beyond idl0's two (the 160 ms section expand and the
    recording pulse)?

## E. Tokens and typography (24–27)

24. Port the thirteen colour tokens as-is, or is this the moment to re-tune them? The
    semantic set (accent, good, hivis, info) is well thought out; the surface ladder is
    where a redesign usually starts.
25. Keep the two-radius rule — 2 px structural, 7 px interactive — or unify?
26. Elevation is zero everywhere and depth comes from surface steps plus hairlines. Keep
    the flatness, or allow shadow?
27. IBM Plex is a free bundle-able pair. Stay with it, or is there a face you would
    rather have now that the CDN constraint forces an explicit choice anyway?

## F. Charts (28–32)

28. Observable Plot draws SVG with its own defaults. Should charts read as part of the
    app chrome (mono tick labels, `#353A32` gridlines, near-black plot area), or as
    documents on a lighter ground the way a paper figure would?
29. Keep the eight-hue series cycle exactly as it is, and keep per-channel colour
    override as a feature?
30. Turbo for continuous data: keep, or move to a perceptually uniform scale like Viridis
    now that nothing is locked in?
31. Which idl0 chart interactions are non-negotiable in idl1 — shared cursors, the
    right-click action menu, keyboard zoom and pan, the drag-rectangle zoom?
32. Should charts be printable or exportable as a figure, given the "scientific paper"
    framing of the mobile view?

## G. The notebook (33–36)

33. What should editing a cell feel like — a document you type into, or an IDE with
    panes? The design doc gives Properties plus Code panes but not the mood.
34. How visible should code be at rest? Collapsed to output only, or always shown?
35. Does the notebook get a distinct visual register from the Device and Data tabs — more
    paper-like, more generous, lighter — or must everything be one skin?
36. CodeMirror needs a theme. Match the brand palette, or use a known editor theme so
    syntax colours behave?

## H. Ambiguities the survey turned up (37–38)

37. idl0 uses dialogs about five times more often than bottom sheets, and snackbars in 97
    places. Was that a considered pattern or accumulated drift? It decides whether idl1
    needs a toast system on day one.
38. Selection in the Data tab is an XOR between session-mode and lap-mode, with muted
    checkboxes that still respond and flip mode. Is that model correct and worth porting
    exactly, or is it a known rough edge to redesign?
