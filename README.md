# Figma to Prompt

一款 Figma 外掛，可將設計資料擷取為結構化 JSON 與適合 AI 使用的 Markdown prompt。把輸出提供給 ChatGPT、Claude 或其他 LLM，即可協助產生前端元件。

![Demo](.github/workflows/assets/demo.png)

## 功能特色

- **JSON 匯出** — 匯出任意 frame 的完整階層 JSON，包括 layout、style、typography、color 與 design token
- **AI Prompt** — 自動產生不綁定特定框架的 Markdown prompt，並內嵌 JSON 規格
- **AI Package** — 打包 `prompt.md`、完整 node JSON、Figma 參考渲染圖、與 node 對應的素材，以及高風險圖層所需的 1× PNG 與轉外框 SVG fallback
- **完整擷取 Gate** — 任何選取範圍參考圖、必要圖片素材或精確尺寸 pixel fallback 缺失時，拒絕下載不完整的 AI Package
- **機器可讀的還原度覆蓋資料** — 加入 `fidelity/coverage.json` 與 manifest 摘要，將每個高風險 node 對應到權威的 pixel／vector 證據；仍有缺口時不能打包
- **直接使用的 Figma MCP Locator** — 加入 `mcp/figma-locator.json`；遠端檔案可用時，包含所有選取與後代 node 的 ID、階層、file key 與 node 專屬 Figma URL
- **確定性參考圖 Gate** — 連續兩次 Figma 渲染的 RGBA 必須完全相同，才能產生 AI Package 或進行精確截圖比對
- **精確 Viewport Contract** — 記錄權威 PNG 與實際 pixel 尺寸；多選匯出會包含已合成的 `references/selection.png`
- **高還原度 Layout** — 保留 Auto Layout wrap、Figma Grid tracks／spans、min／max sizing、transform、文字尺寸調整與截斷設定
- **進階 Typography** — 保留混合文字樣式範圍、精確裝飾幾何、OpenType 設定，以及沿 vector path 排列的文字
- **進階 Geometry** — 保留原始 vector path、arc、squircle、複雜 stroke，以及 linear／radial transform repeat，並附上精確渲染 fallback
- **Prototype 與 Component 語意** — 匯出 trigger／action、scrolling、fixed layer、overlay 行為、Dev Mode annotation、component 文件、typed property、variable mode／binding、引用的 variable value／code syntax，以及目前 instance value
- **Fail-closed 還原策略** — 新型或 CSS 無法表達的 paint／effect、multiple paint stack、linear burn／dodge、noise、texture 與 glass 會自動要求精確的 Figma-rendered fallback，避免效果消失或混色錯誤
- **多選支援** — 可選取任意數量的 node，所有 image fill 都會收進同一次匯出
- **清晰圖片匯出** — 預設使用無損 2× PNG；支援 1×–4× 的 PNG／JPG／WebP／AVIF／SVG，以及原始上傳 pixel；crop／filter／transform variant 會同時驗證最終編碼尺寸與放大前的真實來源密度
- **逐張或合併匯出** — 可分別匯出每個 image fill，或把整個選取範圍合成單一檔案
- **自訂檔名** — 下載前可直接重新命名每個圖片素材，檔名也會同步到 prompt
- **複製與下載** — 一鍵複製到剪貼簿或下載 zip
- **即時更新** — Figma 選取範圍變更後立即更新
- **內建視覺驗證器** — 將 AI 截圖與最新的 1× Figma 渲染結果比較；100% 代表每個 RGBA channel 都完全相同

## 安裝

一般 Figma 使用者不需要安裝 Node.js、`pnpm`，也不需要下載原始碼。只要在 Figma 匯入一次外掛套件，設計擷取、AI Package 產生與截圖驗證都會在外掛內完成。下方從原始碼建置的流程僅供維護者與貢獻者使用。

### 方式一：從 Releases 下載（建議）

1. 前往 [Releases](https://github.com/runkids/figma-to-prompt/releases)，下載最新的 `.zip`
2. 解壓縮後會得到包含 `manifest.json` 與 `dist/` 的資料夾

接著請依照「[匯入 Figma](#import-into-figma)」操作。

### 方式二：從原始碼建置（僅限維護者）

```bash
git clone https://github.com/runkids/figma-to-prompt.git
cd figma-to-prompt
pnpm install
pnpm build
```

接著請依照「[匯入 Figma](#import-into-figma)」操作。

<a id="import-into-figma"></a>

### 匯入 Figma

> **注意：** Figma 外掛只能透過 [Figma Desktop app](https://www.figma.com/downloads/) 載入，不能使用瀏覽器版 Figma 匯入。

1. 開啟 **Figma Desktop** 與任意設計檔案
2. 點擊右上角的 **+**，選擇 **Import plugin from manifest...**
   <img src=".github/workflows/assets/import.png" alt="匯入外掛" width="360" />

3. 選擇解壓縮資料夾（或 clone 下來的 repository 根目錄）內的 `manifest.json`
4. 完成後，**Figma to Prompt** 會出現在 **Plugins** → **Development**

#### 啟動外掛

- **選單：** Plugins → Development → Figma to Prompt
- **快速搜尋：** 按下 `⌘ /`（Mac）或 `Ctrl /`（Windows），輸入 `Figma to Prompt`

## 使用方式（全程在 Figma 內完成）

1. 在 Figma 啟動外掛
2. 在畫布上選取 frame、component 或 group
3. 切換需要的分頁：
   - **JSON** — 結構化設計資料
   - **Prompt** — 適合提供給 AI 的 Markdown prompt
4. 若要取得最完整的結果，請維持選取 **Pixel Perfect**、**Full** 與 **Whole frame**
5. 點擊 **Download AI package**，將產生的 `.figmacapture.zip` 附加給 AI agent
6. 若工作流程只能傳送文字，請另外下載完整 frame 圖片，並和複製的 prompt 一起提供給 AI
7. 要求 AI agent 依照擷取出的精確 viewport 進行渲染，並回傳無損 PNG 截圖
8. 在外掛開啟 **Verify AI screenshot**，上傳截圖以查看 pixel-match 分數與標示過的差異圖
9. 分數低於 100% 時，下載修正套件，將整個 ZIP 再交給 AI。內容包括最新參考圖、前一次 AI 截圖、洋紅色 diff、精確指標、依優先序排列且彼此不相連的錯誤區域、可能對應的 Figma node，以及下一輪修正指示

如果 Figma 無法渲染任何必要參考圖、圖片素材或精確尺寸的 pixel fallback，外掛會停止下載並指出缺失的 node，不會產生不完整的 package。
Package manifest 內的 `root.targetViewport` 是截圖寬高的權威值，可避免 Figma 小數幾何、effect 或多選邊界導致的 off-by-one 輸出。
Package 內的 `fidelity/coverage.json` 是每個 node 的權威風險清單。它會記錄 node 為何需要 renderer-backed evidence、由哪個 PNG／SVG 覆蓋，以及最終精確度仍需與主要參考圖進行 RGBA pixel equality 驗證。

打包後的 `assets/*.png` 不固定為 1×。外掛會依照圖片的 fill／fit／crop／tile 幾何測量上傳來源，並以最高 4× 的真實、未插值密度匯出。低於 2× 的來源仍會忠實保留設計稿中的 1× viewport，但 package 會明確警告，不會把放大插值的檔案假裝成 retina-sharp 圖片。

使用 MCP 輔助時，請先讀取 `mcp/figma-locator.json`。每個真實 Figma node 都有 colon-form `nodeId`、所屬 selection root 與階層；Figma 提供 file key 時，還會包含標準 `/design/…?node-id=1-2` `sourceUrl` 與 `{ fileKey, nodeId }` locator。本機 draft 仍會保留全部 node ID，但會標示為 `local-only`，因為沒有 file key 時 MCP 無法重新開啟遠端檔案。
在打包或比較 AI 截圖前，外掛會連續渲染 Figma target 兩次。如果兩次的尺寸或任何 RGBA pixel 不一致，精確驗證會停止並回報不穩定區域，避免把持續變動的設計誤判成 AI 錯誤。

圖片下載預設使用清晰的 **2× PNG**。可以直接取得上傳 raster bytes 時，**Orig** 會回傳原始資料；crop、filter、opacity 或 transform variant 則會以 Figma 支援且符合來源解析度的最高 scale（2×–4×）渲染。JPG、WebP 與 AVIF 即使預設 100% quality，仍屬於有損格式；需要精確 pixel 時請使用 PNG。
儲存前，外掛會解碼最終 PNG／JPG／WebP／AVIF，並依選取的 scale 驗證兩個軸向。長邊與短邊會各自配對，讓 90° rotation 仍能正確驗證，同時避免其中一軸多出的 pixel 掩蓋另一軸的模糊問題。shadow 或 stroke 超出 node 時，會使用包含 effect 的 render bounds。若 Figma 或瀏覽器 encoder 回傳的 pixel 少於需求，下載會停止並顯示實際與預期尺寸，而不是默默產生模糊圖片。原始 **Orig** bytes 不會修改；只有需要由 Figma 重新渲染的 Orig variant 必須符合 2× 清晰度下限。
包括 Merged 與 Per selection 在內的每種 raster mode，都會在 `exportAsync` 前依照 Figma fill／fit／crop／tile 幾何檢查上傳圖片尺寸。若 2× 或 4× 輸出只是把低密度來源放大插值，外掛會拒絕下載並顯示受影響圖層與真實密度；請在 Figma 中替換為更高解析度的來源後重試。**Orig** 會保留偵測到的實際格式（PNG、JPEG、GIF、WebP 或 AVIF），不會把其他格式的 bytes 錯誤標成 `.png`。

## 搭配 AI Coding Agent 使用

### 安裝 Skill（建議）

此 repo 內含 [design-to-code skill](skills/figma-to-prompt/SKILL.md)，用來教 AI agent 解讀外掛輸出並產生精確的 UI component。任何支援 skillshare 格式的 agent 都可以使用。

```bash
skillshare install runkids/figma-to-prompt
```

安裝後，將 AI Package、複製的 prompt 或 JSON 提供給 AI。Agent 會以 `root.primaryReferencePath` 作為視覺真相、依 `root.targetViewport` 渲染、把 Auto Layout／Grid 對應成 CSS、保留素材與 paint order，並透過截圖比較反覆修正。

### 直接貼上 Prompt

不需要額外設定，直接將 **Prompt** 分頁的內容貼到 ChatGPT、Claude、Gemini、Copilot 或其他 LLM。Prompt 已包含轉換指引、design token 與完整 component 結構。

## 輸出範例

外掛會產生一個 `UISerializedNode` 樹狀結構：

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

**Prompt** 分頁會把資料放進包含轉換指引的 Markdown template，可直接提供給 AI 使用。

## 開發

### 前置需求

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/)
- [Figma Desktop](https://www.figma.com/downloads/)

### 開發模式

請在兩個 terminal 分別執行監看程序：

```bash
# Terminal 1 — sandbox（Figma API 端）
pnpm dev:sandbox

# Terminal 2 — UI（外掛面板）
pnpm dev:ui
```

儲存檔案後會自動重新建置。請在 Figma 重新開啟外掛，以載入最新版本。

### 測試

```bash
pnpm test          # 執行一次
pnpm test:watch    # watch 模式
```

### 建置

```bash
pnpm build
```

建置結果為 `dist/code.js`（sandbox）與 `dist/ui.html`（UI panel）。

### 視覺還原度 Gate（維護者）

一般使用者應使用外掛在 Figma 內提供的 **Verify AI screenshot** panel。開發此 repository 或執行 CI 時，可用下列指令比較兩個 PNG；變更 pixel 比率超過允許上限時，指令會以非零狀態結束：

```bash
pnpm visual:diff -- reference.png implementation.png \
  --pixel-threshold 0.01 \
  --max-diff-ratio 0 \
  --diff visual-diff.png
```

對可重現的本機渲染，請使用精確比對（`0`）。較小的 `--pixel-threshold` 可忽略 renderer noise，但不應掩蓋 layout、typography、color 或 asset 差異。

## 技術棧

- **TypeScript**
- **Preact** — UI framework，透過 React-compatible alias 支援 ecosystem library
- **Vite** — sandbox 與 UI 的雙 config bundler
- **Vitest** — unit testing
- **Tailwind CSS v4** — UI styling
- **vite-plugin-singlefile** — 將所有內容 inline 到單一 `ui.html`

## 授權

[MIT](LICENSE)
