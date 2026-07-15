---
name: figma-to-prompt
description: Convert Figma to Prompt exports into high-fidelity frontend UI. Use for `.figmacapture.zip` AI packages, UISerializedNode JSON, `# Component:` or `# Pixel-perfect Figma rebuild:` prompts, and Figma-to-code requests. Covers reference-driven screenshot iteration, Auto Layout and Grid mapping, typography, paint stacks, transforms, instances, vectors, and bundled assets.
---

# Figma to Prompt — Design-to-Code Conversion

## Overview

The user has a Figma plugin called **Figma to Prompt** that exports design frames as structured JSON (`UISerializedNode`) or AI-ready markdown prompts. Your job is to read that output and produce production-quality frontend components.

**Core principle:** For visual appearance, the bundled reference render is the source of truth. Use JSON for exact structure, geometry, styles, paint order, and asset identity. Never guess when a reference, JSON field, vector path, or bundled asset provides evidence.

Always return a lossless PNG screenshot at the exact extracted root size. The user can load it into Figma to Prompt's built-in **Verify AI screenshot** checker for a strict pixel-match score and highlighted diff. Do not use JPEG or WebP for verification.

## Recognizing Plugin Output

The plugin outputs three formats. Prefer the AI package when available.

### Format 1: AI Package

A `.figmacapture.zip` containing:

- `manifest.json` — file roles, hashes, node IDs, authoritative paths, and the exact target viewport
- `mcp/figma-locator.json` — every selected and descendant Figma node ID, hierarchy, and node-specific MCP locator
- `prompt.md` — implementation contract; read this first
- `design/nodes.json` — complete serialized selection
- `fidelity/coverage.json` — fail-closed ledger mapping every precision-risk node to exact pixel evidence and optional scalable vector evidence
- `references/*.png` — visual sources of truth
- `assets/*.png` — rendered design assets matched through manifest `nodeId`
- `fallbacks/*.png` — Figma-rasterized 1× fallbacks for exact target-size matching
- `fallbacks/*.svg` — scalable fallbacks with outlined text and unsimplified strokes

Keep the extracted directory intact. Resolve paths from the bundle root and treat the manifest paths as authoritative if another generated filename differs.
Read `mcp/figma-locator.json` before using a Figma MCP tool, then read `fidelity/coverage.json` before implementation. Prefer a node's canonical `/design/…?node-id=1-2` `locator.sourceUrl`; otherwise use its `locator.fileKey` and colon-form `locator.nodeId` according to that MCP tool's documented inputs. The coverage file's `nodes` list is the machine-readable minimum fidelity contract: every entry must use its `pixelPath`, its optional `vectorPath`, or a native implementation subsequently proven identical by the final RGBA comparison. An unresolved node means the package is invalid and implementation must stop.
Bundled design assets use the highest verified non-interpolated source density available up to 4×. Do not enlarge them beyond their manifest `pixelDimensions`; if the manifest warns that an asset has less than 2× real source detail, request a higher-resolution Figma source instead of applying CSS or encoder upscaling.
Use `manifest.root.primaryReferencePath` as the final visual target and `manifest.root.targetViewport.width` / `height` as the exact CSS-pixel screenshot size. Never recompute that viewport from fractional JSON geometry or another asset. For a multi-selection package, `references/selection.png` is already composed in the same coordinate space used by the plugin verifier; the per-node references remain detail evidence only.
Use a rendered fallback when a matching node cannot be reproduced exactly with native HTML/CSS/SVG. Prefer the manifest `fallbackVariant: pixel` file for the exact extracted viewport; use `fallbackVariant: vector` only when that node must scale. Preserve semantics and interactions with accessible HTML overlays instead of discarding behavior.
Do not treat output pixel dimensions alone as proof of sharp source detail. For every raster mode, Figma to Prompt measures the uploaded source against fill/fit/crop/tile geometry before upscaling; if the plugin rejects a layer below the selected 1×–4× density, replace the source in Figma rather than enlarging the rejected raster. Original downloads retain the detected encoded MIME and extension instead of relabeling JPEG/GIF/WebP/AVIF bytes as PNG.
The plugin refuses to create a package when a selected reference, required image asset, or exact-size pixel fallback is missing. Do not ask the user to clone this repository or run package-manager commands; the capture and verification workflow belongs in the installed Figma plugin.
`manifest.fidelity.exactVerification.referenceStability` proves that two consecutive Figma renders were RGBA-identical at the target viewport. If this evidence is absent or any later plugin verification reports an unstable reference, stop the pixel-perfect loop until video, animation, font loading, or other changing content is frozen.

### Format 2: Markdown Prompt

Starts with `# Component: {name}` and contains sections:
- **Guidelines** — conversion rules
- **Design Tokens** — colors, typography, spacing, radii, shadows
- **Component Dependencies** — INSTANCE nodes to implement
- **Interaction Contract** — exact Figma scrolling, fixed layers, overlays, triggers, and ordered actions
- **Component API Contract** — documentation, annotations, typed properties, sublayer references, variable bindings/modes/catalogs, and active instance values
- **Assets** — image files with dimensions
- **Component Structure** — single-line JSON of the full node tree

### Format 3: Raw JSON

A `UISerializedNode` tree. Root node looks like:
```json
{
  "id": "...",
  "name": "Card",
  "type": "FRAME",
  "layout": { ... },
  "style": { ... },
  "children": [ ... ]
}
```

## Node Type Mapping

| Node Type | What It Represents | Convert To |
|-----------|-------------------|------------|
| `FRAME` | Container / layout wrapper | `<div>`, `<section>`, `<header>`, `<nav>` — pick semantic tag |
| `GROUP` | Visual grouping; may carry opacity, blend mode, or effects | `<div>` wrapper; do not flatten when group-level style is present |
| `TRANSFORM_GROUP` | Children repeated linearly or radially | Generate repeated instances from `transformModifiers`; keep the rendered fallback as the pixel truth |
| `TEXT` | Text content | `<p>`, `<h1>`–`<h6>`, `<span>`, `<label>` — based on context |
| `TEXT_PATH` | Text flowing along vector geometry | SVG `<textPath>` using `vectorPaths` and `textPathStartData`; use the node fallback when browser glyph metrics differ |
| `RECTANGLE` | Shape / decorative element | `<div>` with CSS, or `<img>` if has image fill |
| `ELLIPSE` | Circle / oval shape | `<div>` with `border-radius: 50%` |
| `VECTOR` | Icon / custom shape | `<svg>` or icon component |
| `LINE` | Divider / separator | `<hr>` or `<div>` with border |
| `INSTANCE` | Reusable component reference | Import or create as separate component |
| `COMPONENT` | Component definition | Same as FRAME — it's the source definition |
| `SECTION` | Page section | `<section>` |

### Semantic HTML Decision

Don't blindly use `<div>` for everything. Use the node's **name** and **context** as hints:

```
name: "Header"       → <header>
name: "Navigation"   → <nav>
name: "Footer"       → <footer>
name: "Card"         → <article> or <div>
name: "Button"       → <button>
name: "Link"         → <a>
name: "Input"        → <input>
name: "List"         → <ul> / <ol>
name: "ListItem"     → <li>
name: "Image"        → <img>
```

## Layout Mapping

### `layout.mode` → CSS Display

| `mode` | CSS |
|--------|-----|
| `"horizontal"` | `display: flex; flex-direction: row;` |
| `"vertical"` | `display: flex; flex-direction: column;` |
| `"grid"` | `display: grid;` using the extracted tracks, gaps, anchors, and spans |
| `"none"` | No auto-layout — use absolute positioning or let content flow naturally |

For `layout.wrap: "wrap"`, add `flex-wrap: wrap`; use `counterAxisSpacing` for the wrapped-track gap and map `counterAxisAlignContent` to `align-content`.

For Grid, map `gridRowSizes` / `gridColumnSizes`: `fixed` → px, `flex` → `fr`, and `hug` → `fit-content(100%)`. Place children from their row/column anchor indices and spans.

### `layout.sizing` → Width / Height

| `sizing.horizontal` | CSS Width |
|---------------------|-----------|
| `"fixed"` | `width: {layout.width}px;` |
| `"hug"` | `width: auto;` (or `width: fit-content;`) |
| `"fill"` | `width: 100%;` or `flex: 1;` |

| `sizing.vertical` | CSS Height |
|--------------------|------------|
| `"fixed"` | `height: {layout.height}px;` |
| `"hug"` | `height: auto;` |
| `"fill"` | `height: 100%;` or `flex: 1;` |

### `layout.primaryAxisAlign` → Justify Content

| Value | CSS `justify-content` |
|-------|----------------------|
| `"min"` | `flex-start` |
| `"max"` | `flex-end` |
| `"center"` | `center` |
| `"space-between"` | `space-between` |

### `layout.counterAxisAlign` → Align Items

| Value | CSS `align-items` |
|-------|-------------------|
| `"min"` | `flex-start` |
| `"max"` | `flex-end` |
| `"center"` | `center` |
| `"baseline"` | `baseline` |

### Other Layout Properties

| JSON Property | CSS |
|---------------|-----|
| `layout.gap` | `gap: {value}px;` |
| `layout.padding` | `padding: {top}px {right}px {bottom}px {left}px;` |
| `layout.overflow: "hidden"` | `overflow: hidden;` |
| `layout.rotation` | `transform: rotate({value}deg);` |
| `layout.relativeTransform` | Preserve rotation/skew with a CSS matrix; do not apply its translation twice |
| `layout.renderBounds` | Effect/stroke-inclusive box relative to the node; use for fallback placement and overflow checks |
| `layout.minWidth/maxWidth/minHeight/maxHeight` | Matching CSS size bounds |
| `layout.x`, `layout.y` | Parent-relative offsets for `mode: "none"` and `layoutPositioning: "absolute"` |
| `layout.itemReverseZIndex: true` | Reverse normal sibling paint order |
| `layout.gridChildHorizontalAlign/gridChildVerticalAlign` | Map each Grid child's cell alignment independently |

### Width / Height for `mode: "none"`

When `layout.mode` is `"none"`, the node has no auto-layout. Use `layout.width` and `layout.height` directly as fixed dimensions. Position with `x` / `y` if present.

## Style Mapping

### Colors

| JSON Property | CSS |
|---------------|-----|
| `style.backgroundColor` | `background-color: {hex};` |
| `style.color` | `color: {hex};` |
| `style.borderColor` | `border-color: {hex};` |

### Design Tokens / Variables

When `style.variables` is present, prefer CSS custom properties over hardcoded hex:

```json
"style": {
  "backgroundColor": "#F5F5F5",
  "variables": {
    "backgroundColor": "BG/BG Neutral 1"
  }
}
```

→ Use `background-color: var(--BG-BG-Neutral-1);` (convert `/` and spaces to `-`)

This maps to the team's design system. If the target project has a token system (Tailwind, CSS variables, etc.), map to the closest token.

### Borders & Radius

| JSON Property | CSS |
|---------------|-----|
| `style.borderRadius` | `border-radius: {value}px;` |
| `style.borderWidth` | `border-width: {value}px;` |
| `style.borderColor` | `border-color: {hex};` (combine with border-width: `border: {width}px solid {color};`) |
| `style.cornerRadii` | `border-radius: {topLeft}px {topRight}px {bottomRight}px {bottomLeft}px;` |
| `style.cornerSmoothing` | Preserve the Figma squircle shape; use a supported superellipse or exact SVG/mask rather than a plain rounded rectangle |

### Typography (`TEXT` and `TEXT_PATH` nodes)

| JSON Property | CSS |
|---------------|-----|
| `style.fontFamily` | `font-family: '{value}', sans-serif;` |
| `style.fontStyleName` | Select the exact font face (for example italic or condensed), not only its numeric weight |
| `style.fontSize` | `font-size: {value}px;` |
| `style.fontWeight` | `font-weight: {value};` |
| `style.openTypeFeatures` | Map enabled/disabled tags to `font-feature-settings` |
| `style.lineHeight` | `line-height: {value}px;` |
| `style.letterSpacing` | `letter-spacing: {value}px;` or `letter-spacing: {value}%;` (check `letterSpacingUnit`) |
| `style.textAlign` | `text-align: {value};` |
| `style.textAlignVertical` | Align text inside its fixed-height box without changing box geometry |
| `style.textAutoResize` | Preserve fixed, height-growing, or intrinsic text-box sizing |
| `style.textTruncation: "ending"` | Ellipsis; combine with `maxLines` using line clamping |
| `style.textDecoration` | `text-decoration: {value};` |
| `style.textDecorationStyle` | `text-decoration-style` (`solid`, `wavy`, or `dotted`) |
| `style.textDecorationOffset` | `text-underline-offset`; preserve px, percent, or auto |
| `style.textDecorationThickness` | `text-decoration-thickness`; preserve px, percent, or auto |
| `style.textDecorationColor` | `text-decoration-color`; preserve its opacity/variable evidence |
| `style.textDecorationSkipInk` | `text-decoration-skip-ink: auto` when true, `none` when false |
| `style.textCase` | `text-transform: uppercase / lowercase / capitalize;` |

Also preserve paragraph indent/spacing, list spacing, hanging punctuation/list behavior, and leading trim when those fields are present. Use `arcData` to reproduce partial ellipses and donut geometry exactly instead of drawing a full oval.
For `TEXT_PATH`, use the exact `vectorPaths` geometry and begin at `textPathStartData.segment` / `position`. Because SVG and Figma can shape glyphs differently, prefer the bundled pixel fallback at the exact target or outlined SVG when scalable visual identity matters.

For `TRANSFORM_GROUP`, apply `transformModifiers` in array order. A linear repeat uses `count`, `axis`, `offset`, and `unitType`; a radial repeat distributes the repeated child geometry around the group. Do not manually approximate the visible copies. Use the node-matched PNG for exact target-size fidelity or the outlined SVG when the ornament must scale.

### Shadows

```json
"shadows": [{
  "type": "drop",
  "color": "#000000",
  "offsetX": 0,
  "offsetY": 4,
  "blur": 8,
  "spread": 0
}]
```

→ `box-shadow: 0px 4px 8px 0px #000000;`

For `"type": "inner"` → `box-shadow: inset 0px 4px 8px 0px #000000;`

### Noise, Texture, and Glass

`style.advancedEffects` preserves the available Figma parameters for `noise`, `texture`, and `glass` effects. These effects do not have an exact portable CSS equivalent. Use the metadata for semantic/native approximations only after placing the matching rendered fallback; the PNG remains authoritative at the target viewport and the outlined SVG is the scalable option when available.

Any critical `unsupported-fill-*` or `unsupported-effect-*` fidelity warning is fail-closed evidence: do not discard or approximate the visual feature silently. Use its node-matched fallback and preserve accessible or interactive behavior with an overlay.

Treat `multiple-fills`, `multiple-strokes`, `non-css-blend-mode-linear-burn`, and `non-css-blend-mode-linear-dodge` the same way. Their raw paint stacks remain useful implementation metadata, but only the Figma-rendered fallback is authoritative for exact order, clipping, geometry, and compositing.

If `fidelityWarnings` contains `complex-stroke`, use the node-matched rendered fallback. Variable-width, brush, and dynamic strokes must not be downgraded to a basic CSS border.

### Gradients

`style.backgroundGradient` is already in CSS-like format:

```json
"backgroundGradient": "linear-gradient(#FF0000 0%, #0000FF 100%)"
```

→ `background: linear-gradient(#FF0000 0%, #0000FF 100%);`

### Opacity

`style.opacity` → `opacity: {value};` (only present when < 1)

### Images

When `style.imageFillHash` is present, the node contains an image:

| `imageFillScaleMode` | CSS |
|---------------------|-----|
| `"fill"` | `object-fit: cover;` |
| `"fit"` | `object-fit: contain;` |
| `"crop"` | `object-fit: cover;` with specific dimensions |
| `"tile"` | `background-repeat: repeat;` |

The image file name is provided in the **Assets** section of the prompt. Use it as the `src`.

## Handling INSTANCE Nodes

INSTANCE nodes represent **reusable components** from the Figma design system:

```json
{
  "type": "INSTANCE",
  "name": "Primary Button",
  "componentName": "Button/Primary",
  "componentProperties": {
    "State": "Active",
    "Size": "Large"
  },
  "children": [...]
}
```

### Strategy

1. **If component exists in your project** → import and use it with matching props
2. **If not** → create it as a separate component based on the `children` tree
3. `componentName` tells you the component hierarchy: `Button/Primary` → `<ButtonPrimary>` or `<Button variant="primary">`
4. `componentProperties` are variant props → map to component props
5. `componentPropertyDefinitions` define the component's public props, types, defaults, allowed variants, and descriptions
6. `componentPropertyDetails` preserve active instance values with their original boolean/string types; do not coerce booleans to strings

## Handling Prototype Reactions

Treat `reactions` as the authoritative interaction contract. Each reaction contains one `trigger` and an ordered `actions` array.

1. Implement `prototype.overflowDirection`, `fixedChildIds`, overlay position/background, and click-outside behavior. Fixed children stay above scrolling content.
2. Implement explicit triggers such as `ON_CLICK`, `ON_HOVER`, `ON_PRESS`, `ON_DRAG`, keyboard, timeout, and media triggers before inferring behavior from visual naming.
3. Preserve ordered actions including URL, node navigation, overlays, back/close, component changes, media control, variables, variable modes, and conditional actions.
4. Resolve target node IDs against the serialized tree. Preserve transition metadata when the target runtime supports it.
5. Infer an interaction from semantics or node names only when the node has no exported reaction.

Treat developer-authored semantic metadata as constraints, not comments:

- `annotations` captures Dev Mode instructions and the properties they apply to.
- `componentPropertyReferences` connects sublayer visibility, text, and instance swaps to public component props.
- `variableBindings` preserves every available token binding, not only fill and stroke colors.
- `explicitVariableModes` preserves the selected collection mode such as Light, Dark, Compact, or Brand B.
- `referencedVariables` provides the names, types, collections, per-mode values, scopes, and platform code syntax needed to implement variables referenced by bindings or prototype actions.

## Conversion Workflow

```
1. Read `prompt.md`, `manifest.json`, `mcp/figma-locator.json`, `fidelity/coverage.json`, the full JSON, and every reference render
    │
2. Identify the component hierarchy
    │  Root node = main component
    │  INSTANCE children = sub-components to import or create
    │
3. Map layout structure
    │  Build the HTML skeleton following the node tree
    │  Set flex direction, gap, padding, sizing
    │
4. Apply styles
    │  Colors, borders, radius, shadows, typography
    │  Prefer design tokens (variables) over raw hex when available
    │
5. Handle text content
    │  Use `text` field for TEXT nodes
    │  Choose semantic tags based on context
    │
6. Handle images
    │  Match imageFillHash nodes to asset file names
    │  Set object-fit based on scaleMode
    │  Use node-matched fallbacks for text/vector/complex layers that cannot match natively
    │
7. Implement interactions
    │  Apply prototype scrolling, fixed layers, and overlay presentation first
    │  Treat `reactions` as the authoritative behavior contract
    │  Map each trigger and ordered action, including navigation, overlays, URLs, variables, media, and conditions
    │  Infer behavior from semantics or node names only when no reaction exists
    │
8. Verify the exact target
    │  Render at manifest.root.targetViewport width and height
    │  Compare against manifest.root.primaryReferencePath
    │  Capture a screenshot and compare with the reference
    │  Correct geometry, typography, paint, crop, vector, and stacking differences
    │  Repeat until the accepted visual-diff threshold passes
    │  Return the final exact-size screenshot for the plugin's Verify AI screenshot checker
    │  For every non-zero pass, read the downloaded correction ZIP
    │  Use reference.png, candidate.png, visual-diff.png, and verification.json together
    │  Fix verification.json.metrics.diffRegions in priority order; use each exact x/y/width/height box, density, mean error, max channel delta, and attributed node IDs to isolate the responsible component
9. Add responsive behavior only after the exact target matches
    │  Do not replace extracted px values during the fidelity pass
```

## Tailwind CSS Mapping (Quick Reference)

If the target project uses Tailwind:

| Figma Property | Tailwind Class |
|----------------|----------------|
| `gap: 16` | `gap-4` |
| `padding: {16,16,16,16}` | `p-4` |
| `padding: {8,16,8,16}` | `px-4 py-2` |
| `mode: "horizontal"` | `flex flex-row` |
| `mode: "vertical"` | `flex flex-col` |
| `primaryAxisAlign: "center"` | `justify-center` |
| `counterAxisAlign: "center"` | `items-center` |
| `sizing.horizontal: "fill"` | `w-full` or `flex-1` |
| `sizing.vertical: "hug"` | `h-auto` or `h-fit` |
| `borderRadius: 8` | `rounded-lg` |
| `borderRadius: 9999` | `rounded-full` |
| `fontSize: 14` | `text-sm` |
| `fontSize: 16` | `text-base` |
| `fontWeight: 700` | `font-bold` |
| `overflow: "hidden"` | `overflow-hidden` |

## Framework Adaptation

The JSON is framework-agnostic. Adapt based on the target:

### React
```jsx
// FRAME with vertical layout → div with flex-col
<div className="flex flex-col gap-4 p-4">
  {/* TEXT node */}
  <h2 className="text-2xl font-bold text-gray-900">
    {title}
  </h2>
  {/* INSTANCE node → separate component */}
  <Button variant="primary" size="large" />
</div>
```

### Vue
```vue
<template>
  <div class="flex flex-col gap-4 p-4">
    <h2 class="text-2xl font-bold text-gray-900">
      {{ title }}
    </h2>
    <Button variant="primary" size="large" />
  </div>
</template>
```

### Plain HTML/CSS
```html
<div style="display:flex; flex-direction:column; gap:16px; padding:16px;">
  <h2 style="font-size:24px; font-weight:700; color:#111827;">
    Title
  </h2>
</div>
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `<div>` for everything | Read node `name` for semantic hints (Header → `<header>`) |
| Ignoring `sizing` and using fixed width/height for all | `hug` → auto, `fill` → 100%/flex:1, only `fixed` uses px |
| Treating `mode: "none"` like flexbox | No auto-layout → fixed position or natural flow |
| Hardcoding hex when `variables` exist | Map `variables` to CSS custom properties or design tokens |
| Ignoring INSTANCE `componentName` | These are reusable components — extract or import them |
| Ignoring `reactions` and guessing from node names | Implement every exported trigger and ordered action first; infer only when no reaction exists |
| Ignoring prototype scrolling or fixed layers | Apply `overflowDirection`, keep every `fixedChildId` above scrolling content, and preserve overlay presentation settings |
| Converting boolean component properties to strings | Use `componentPropertyDefinitions` and `componentPropertyDetails` to preserve the declared type and active value |
| Dropping Dev Mode annotations or non-color variables | Treat `annotations`, `componentPropertyReferences`, `variableBindings`, `explicitVariableModes`, and `referencedVariables` as implementation constraints |
| Using `x`/`y` as margin | Treat them as parent-relative offsets when the parent has `mode: "none"` or the node is absolutely positioned |
| Treating wrapped Auto Layout as a single flex row | Apply wrap, wrapped-track gap, and align-content metadata |
| Treating Figma Grid as flexbox | Map exact tracks, gaps, child anchors, and spans to CSS Grid |
| Ignoring `itemReverseZIndex` | Reverse sibling paint order when the parent requests it |
| Forgetting `overflow: "hidden"` | Missing this breaks border-radius clipping on images |
| Converting extracted px values before matching | Keep exact px geometry for the reference viewport; responsive conversion comes later |
| Ignoring `letterSpacingUnit` | Could be `px` or `percent` — check before applying |
| Not handling the `visible: false` case | If `visible` is explicitly `false`, the node is hidden — skip it or add `display: none` |
| Declaring success from code inspection | Render the exact viewport and compare a screenshot against `references/*.png` |
| Returning no verification artifact | Return the exact-size implementation screenshot so the user can run the plugin's built-in checker |
| Recreating a precision-risk layer from memory | Use its node-matched PNG at the exact viewport or SVG when scaling; keep accessible semantics/interactions as overlays |
