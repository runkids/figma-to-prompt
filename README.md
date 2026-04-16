# Figma to Prompt

A Figma plugin that extracts design data into structured JSON and AI-ready markdown prompts — paste into ChatGPT, Claude, or any LLM to generate frontend components.

![Demo](.github/workflows/assets/demo.png)

## Features

- **JSON Export** — Full hierarchical JSON of any frame (layout, styles, typography, colors, design tokens)
- **AI Prompt** — Auto-generates a framework-agnostic markdown prompt with embedded JSON spec
- **Multi-selection** — Select any number of nodes; all image fills are collected into one export
- **Image Export** — PNG / JPG / SVG at 1×–4× scale, or Original (uploaded raster)
- **Per-image or Merged** — Export each image fill separately, or composite the whole selection into one file
- **Custom filenames** — Rename each image asset inline before download; names sync into the prompt
- **Copy / Download** — One-click clipboard copy and zip download
- **Real-time** — Updates instantly when you change your selection

## Install

### Option 1: Download from Releases (Recommended)

1. Go to [Releases](https://github.com/runkids/figma-to-prompt/releases) and download the latest `.zip`
2. Unzip — you'll get a folder with `manifest.json` and `dist/`

Then follow [Import into Figma](#import-into-figma).

### Option 2: Build from Source

```bash
git clone https://github.com/runkids/figma-to-prompt.git
cd figma-to-prompt
pnpm install
pnpm build
```

Then follow [Import into Figma](#import-into-figma).

### Import into Figma

> **Note:** Figma plugins can only be loaded in the [Figma Desktop app](https://www.figma.com/downloads/), not in the browser.

1. Open **Figma Desktop** and any design file
2. Click the **+** button in the top-right, then select **Import plugin from manifest...**
   <img src=".github/workflows/assets/import.png" alt="Import plugin" width="360" />

3. Select the `manifest.json` from the unzipped folder (or cloned repo root)
4. Done! **Figma to Prompt** appears under **Plugins** → **Development**

#### Launch

- **Menu:** Plugins → Development → Figma to Prompt
- **Quick search:** `⌘ /` (Mac) or `Ctrl /` (Windows), type `Figma to Prompt`

## Usage

1. Launch the plugin in Figma
2. Select a frame, component, or group on the canvas
3. Switch between tabs:
   - **JSON** — Structured design data
   - **Prompt** — AI-ready markdown prompt
4. **Copy** — Click the copy button to copy to clipboard
5. **Download** — Save as images (PNG/JPG/SVG, 1x–4x)
6. Paste the prompt into your AI tool and generate frontend code

## Use with AI Coding Agents

### Install Skill (Recommended)

This repo includes a [design-to-code skill](skills/figma-to-prompt/SKILL.md) that teaches AI agents how to interpret plugin output and generate accurate UI components. Compatible with any agent that supports the skillshare format.

```bash
skillshare install runkids/figma-to-prompt
```

Once installed, paste the copied prompt or JSON — the agent will automatically understand the node structure, map layout to flexbox, convert styles to CSS, and handle component dependencies.

### Direct Paste

No setup needed — paste the **Prompt** tab output directly into ChatGPT, Claude, Gemini, Copilot, or any LLM. The prompt includes conversion guidelines, design tokens, and the full component structure.

## Output Example

The plugin generates a `UISerializedNode` tree:

```json
{
  "id": "1:23",
  "name": "Card",
  "type": "FRAME",
  "layout": {
    "mode": "vertical",
    "width": 320,
    "height": 200,
    "gap": 12,
    "padding": { "top": 16, "right": 16, "bottom": 16, "left": 16 },
    "primaryAxisAlign": "min",
    "counterAxisAlign": "min",
    "sizing": { "horizontal": "hug", "vertical": "fixed" }
  },
  "style": {
    "backgroundColor": "#FFFFFF",
    "borderRadius": 8
  },
  "children": [...]
}
```

The **Prompt** tab wraps this in a markdown template with conversion guidelines, ready to use.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/)
- [Figma Desktop](https://www.figma.com/downloads/)

### Dev Mode

Run both watchers in separate terminals:

```bash
# Terminal 1 — sandbox (Figma API side)
pnpm dev:sandbox

# Terminal 2 — UI (plugin panel)
pnpm dev:ui
```

Save triggers a rebuild. Reopen the plugin in Figma to load the latest version.

### Test

```bash
pnpm test          # single run
pnpm test:watch    # watch mode
```

### Build

```bash
pnpm build
```

Outputs `dist/code.js` (sandbox) and `dist/ui.html` (UI panel).

## Tech Stack

- **TypeScript**
- **Preact** — UI framework (with React-compat alias for ecosystem libs)
- **Vite** — Dual config bundler (sandbox + UI)
- **Vitest** — Unit testing
- **Tailwind CSS v4** — UI styling
- **vite-plugin-singlefile** — Inlines everything into a single `ui.html`

## License

[MIT](LICENSE)
