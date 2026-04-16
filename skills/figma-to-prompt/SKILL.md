---
name: figma-to-prompt
description: Use when the user provides a JSON or markdown prompt exported from the Figma to Prompt plugin and wants to convert it into frontend UI code. This skill teaches how to interpret the UISerializedNode structure — mapping layout to flexbox, style to CSS, INSTANCE nodes to reusable components, and image assets to actual files. Use whenever you see a UISerializedNode JSON, a "# Component:" prompt header, or the user mentions Figma to Prompt / design-to-code conversion.
---

# Figma to Prompt — Design-to-Code Conversion

## Overview

The user has a Figma plugin called **Figma to Prompt** that exports design frames as structured JSON (`UISerializedNode`) or AI-ready markdown prompts. Your job is to read that output and produce production-quality frontend components.

**Core principle:** The JSON IS the source of truth. Don't guess — every layout, color, spacing, and font value is explicitly provided.

## Recognizing Plugin Output

The plugin outputs two formats. You may receive either or both:

### Format 1: Markdown Prompt

Starts with `# Component: {name}` and contains sections:
- **Guidelines** — conversion rules
- **Design Tokens** — colors, typography, spacing, radii, shadows
- **Component Dependencies** — INSTANCE nodes to implement
- **Assets** — image files with dimensions
- **Component Structure** — single-line JSON of the full node tree

### Format 2: Raw JSON

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
| `GROUP` | Visual grouping (no layout of its own) | `<div>` wrapper, or flatten if unnecessary |
| `TEXT` | Text content | `<p>`, `<h1>`–`<h6>`, `<span>`, `<label>` — based on context |
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
| `"none"` | No auto-layout — use absolute positioning or let content flow naturally |

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
| `layout.x`, `layout.y` | Only meaningful when `mode: "none"` — use `position: absolute; top: {y}px; left: {x}px;` |

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

### Typography (TEXT nodes)

| JSON Property | CSS |
|---------------|-----|
| `style.fontFamily` | `font-family: '{value}', sans-serif;` |
| `style.fontSize` | `font-size: {value}px;` |
| `style.fontWeight` | `font-weight: {value};` |
| `style.lineHeight` | `line-height: {value}px;` |
| `style.letterSpacing` | `letter-spacing: {value}px;` or `letter-spacing: {value}%;` (check `letterSpacingUnit`) |
| `style.textAlign` | `text-align: {value};` |
| `style.textDecoration` | `text-decoration: {value};` |
| `style.textCase` | `text-transform: uppercase / lowercase / capitalize;` |

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

## Conversion Workflow

```
1. Read the full JSON / prompt
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
    │
7. Extract interactive elements
    │  Buttons, links, inputs — infer from node names
    │  Add click handlers, hover states as appropriate
    │
8. Responsive considerations
    │  Fixed sizes from Figma are a starting point
    │  Convert to relative units (%, rem) where appropriate
    │  Add breakpoints if the design implies responsive behavior
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
| Using `x`/`y` as margin | `x`/`y` are absolute coordinates, only use when parent has `mode: "none"` |
| Forgetting `overflow: "hidden"` | Missing this breaks border-radius clipping on images |
| Converting all px values literally | Consider converting to `rem` (÷16) for better scalability |
| Ignoring `letterSpacingUnit` | Could be `px` or `percent` — check before applying |
| Not handling the `visible: false` case | If `visible` is explicitly `false`, the node is hidden — skip it or add `display: none` |
