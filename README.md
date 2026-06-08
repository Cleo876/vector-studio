# Flat Vector Character Studio - Official Documentation

**Documentation Version: 1.9.0**

Welcome to the official developer and user documentation for the **Flat Vector Character Studio**. This tool is a highly extensible, single-file HTML web application built with React, TailwindCSS, and a custom HTML5 Canvas procedural rendering engine. 

Evolving beyond traditional rigid editors, Vector Studio is a dynamic sandbox designed to create visually appealing, flat-vector characters with native support for 2.5D parallax orientation, volume-based audio lip-syncing, hierarchical manipulation, AI-driven voice acting, and hot-swappable IndexedDB module extensions.

## 📑 Table of Contents

1. [User Interface (UI) Overview](#1-user-interface-ui-overview)
2. [Keyboard Shortcuts](#2-keyboard-shortcuts)
3. [Core Systems & Architecture](#3-core-systems--architecture)
4. [The Scene Graph System](#4-the-scene-graph-system)
5. [Aesthetics & Styling System](#5-aesthetics--styling-system)
6. [2.5D Parallax Orientation Engine](#6-25d-parallax-orientation-engine)
7. [Audio & Lip-Sync Director](#7-audio--lip-sync-director)
8. [AI Voice Studio](#8-ai-voice-studio)
9. [Animation Timeline](#9-animation-timeline)
10. [Custom Assets Guide (.clothes, .hair, etc.)](#10-custom-assets-guide)
11. [Custom Extensions Guide (.js)](#11-custom-extensions-guide)
12. [Hot-Swappable Module Architecture](#12-hot-swappable-module-architecture)
13. [Data Management (Import/Export/Save)](#13-data-management-importexportsave)

---

## 1. User Interface (UI) Overview

The UI is divided into several resizable, modular panels designed for maximum screen real-estate efficiency.

| **Component** | **Location** | **Description** |
| :--- | :--- | :--- |
| **Top Menu Bar** | Top | Contains the main application logo, `File` menu (New, Open, Save, Import/Export), `Edit` menu (Deselect), `Assets` manager, and `Extensions` manager. Displays the active character name. |
| **Toolbar** | Left Edge | Fixed-width vertical bar containing interaction tools: Select, Move, and Pan. |
| **Hierarchy Panel** | Left Column | A collapsible tree-view of the character's internal scene graph. Click nodes to select them. Click arrows to collapse/expand child nodes. |
| **Scene View** | Center | The main WebGL/Canvas2D viewport. Features an infinite grid, click-and-drag panning, scroll-wheel zooming, and overlaid transformation gizmos. |
| **Properties Panel** | Right Column | Dynamically exposes parameters for the currently selected node in the Hierarchy (e.g., Transform X/Y, Style properties, Colors). |
| **Bottom Panel** | Bottom | Contains two tabs: **Character Designer** (Duolingo-style quick visual cyclers and color palettes) and **Timeline** (An extensible hook for animation scripts). |

---

## 2. Keyboard Shortcuts

A professional studio requires fast hotkeys. The following shortcuts are globally available:

| **Shortcut / Hotkey** | **Action** | **Context** |
| :--- | :--- | :--- |
| `V` | **Select Tool** | Activates the pointer tool. Allows clicking to select without moving. |
| `M` | **Move Tool** | Activates the transformation gizmos on the selected node. |
| `H` | **Pan Tool** | Locks the cursor to drag-pan the camera around the scene. |
| `Space` (Hold) | **Quick Pan** | Temporarily switches to Pan tool while held. |
| `Middle Mouse` (Hold)| **Quick Pan** | Temporarily switches to Pan tool while held. |
| `Right Click` (Hold)| **Quick Pan** | Temporarily switches to Pan tool while held. |
| `Alt + Left Click` | **Quick Pan** | Temporarily switches to Pan tool while held. |
| `Mouse Wheel` | **Zoom** | Zooms the camera in and out relative to the screen center. |
| `Ctrl + E` | **Toggle Extensions**| Opens or closes the Extension Manager modal. |

---

## 3. Core Systems & Architecture

The application is bundled into a single file to ensure high portability, utilizing Babel standalone to compile React/JSX on the fly. 

### Rendering Engine
- **Procedural Geometry:** Characters are not drawn using external images (`.png`/`.svg`). They are drawn procedurally using Canvas Context mathematical paths (e.g., `bezierCurveTo`, `arc`, `quadraticCurveTo`). This ensures infinite crispness at any zoom level.
- **Two-Pass Rendering:** 1. **Pass 1 (Meshes):** Recursively traverses the Scene Graph to render character paths, respecting hierarchy transforms and clipping masks. 2. **Pass 2 (Gizmos):** Re-traverses the graph strictly to render transformation axes (Red X, Green Y, Yellow Center) over the selected node. This ensures gizmos are *always* drawn on top of the character.
- **Idle Animations:** A time-based `requestAnimationFrame` loop drives natural breathing (sine-wave Y-axis scaling) and procedural eye tracking/blinking logic without keyframes.

---

## 4. The Scene Graph System

Characters are structured as a parent-child state object called the **Scene Graph**. 

### Node Anatomy
Every part of the character (Body, Head, Eyes) is a "Node". If a parent node (Body) is moved, all child nodes (Head, Eyes) move with it.

```json
{
    "id": "unique_string",
    "name": "Display Name",
    "type": "head", 
    "x": 0, "y": -40, 
    "scaleX": 1, "scaleY": 1,
    "props": {
        "color": "#FFB899",
        "shape": "rounded"
    },
    "children": [ ... ]
}
```
*Note: Any property added to `props` is automatically exposed in the right-hand Properties UI Panel.*

---

## 5. Aesthetics & Styling System

Vector Studio employs a Flat Toon, "Soft-Geometry" design language. To maintain this, properties are universally shared across nodes via the UI.

- **Primary Colors (`props.color` / `props.clothingColor`):** Defines the base fills of shapes. The UI strictly maps to an established, curated color palette to maintain brand unity.
- **Z-Index Layering:** Shapes avoid line-art/strokes. Instead, shadows and depth are created by layering a shape with `rgba(0,0,0,0.15)` over a base color, or via Z-sorting child nodes behind parents.

---

## 6. 2.5D Parallax Orientation Engine

Vector Studio mimics 3D rotation using purely mathematical 2D Canvas manipulation, achieving high performance without WebGL overhead.

- **Cylinder Squash (Foreshortening):** As the body rotates toward 90 degrees, the X-axis is scaled using Cosine logic (`Math.cos(angle)`), narrowing the character appropriately.
- **UV-Wrap Parallax:** Facial features and clothing details slide across the squashed surface using Sine logic (`Math.sin(angle)`), causing elements to perfectly "kiss" the outer contour edge at full profile.
- **Rayman Z-Sorting:** Limbs instantly swap their rendering layer (from foreground to background) based on the leading orientation angle, ensuring proper visual occlusion.

---

## 7. Audio & Lip-Sync Director

By integrating the **Audio Timeline Extension**, Vector Studio intercepts the rendering loop of the `mouth` node to procedurally animate talking.

- **RMS Normalization:** Audio is processed via the Web Audio API's `AnalyserNode`. Raw RMS values are calculated from the ByteTimeDomainData.
- **Auto-Gain Limiter:** The engine actively tracks the local maximum peak, ensuring whisper-quiet dialogue opens the mouth correctly without background noise triggering false speech.
- **Organic Lerping:** Jaw dropping utilizes Catch-and-Release Linear Interpolation (Lerp) to smoothly open fast but close slowly, avoiding robotic snapping.

---

## 8. AI Voice Studio

The Voice Studio uses generative AI to write scripts and synthesize professional voice acting directly into the editor.

- **Gemini Context Generation:** Developers can prompt for a character idea (e.g., "Grumpy pirate"), generating a short, punchy line of dialogue.
- **TTS Synthesizer:** Using the `gemini-2.5-flash-preview-tts` model, script text is converted into raw signed 16-bit PCM data. The studio automatically wraps this data in a WAV header to construct a localized, downloadable audio file ready for the Timeline.

---

## 9. Animation Timeline

The timeline resides in the bottom panel, shifting focus from static design to chronological animation.

- **Scrubbing:** Holding the playhead allows for realtime audio scrubbing (with anti-click volume envelopes applied to audio grains).
- **Time/Zoom Translation:** The canvas visualizes the audio buffer waveform, converting seconds to pixels based on the user's `zoomX` variable. 

---

## 10. Custom Assets Guide

The **Asset Manager** allows users to import custom `.clothes`, `.bdy`, `.hair`, `.nose`, `.moth` (mouth), `.eyes`, and `.head` files.

### What is a Custom Asset File?
An asset file is simply a JSON text file containing an identifier, an optional display name, and a raw JavaScript string under the `render` key. 

### Writing an Asset
Create a file named `spy_trench.clothes`. The payload must contain an `id` and a `render` function string. The render string is executed dynamically by the engine, granting you access to the canvas `ctx`, the node's `props`, and helper functions like `drawRoundedRect` and `drawPill`.

**Example: `spy_trench.clothes`**
```json
{
    "id": "trench_coat",
    "name": "Spy Trench Coat",
    "render": "ctx.fillStyle = props.clothingColor || '#1E293B'; ctx.beginPath(); ctx.moveTo(-50, -20); ctx.lineTo(-30, 120); ctx.lineTo(30, 120); ctx.lineTo(50, -20); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#000000'; ctx.fillRect(-10, 20, 20, 100); ctx.beginPath(); ctx.arc(-20, 40, 5, 0, Math.PI*2); ctx.arc(-20, 70, 5, 0, Math.PI*2); ctx.fillStyle = '#333'; ctx.fill();"
}
```

### Loading the Asset
1. Click **Assets** in the top menu.
2. Click **+ Import Asset** and select `spy_trench.clothes`.
3. Open the **Character Designer** panel at the bottom.
4. Go to **Clothes Style** and click the right Chevron until your asset appears.

---

## 11. Custom Extensions Guide

The **Extension Manager** (`Ctrl+E`) allows developers to inject complex, scalable JavaScript logic directly into the studio environment at runtime without modifying the source `index.html`.

### Extension Metadata (Required)
Every `.js` extension must begin with a JSDoc-style metadata block. The studio parses these comments to populate the UI.

```javascript
// @name        Advanced Auto-Blinker
// @developer   John Doe
// @description Adds a complex twitch to the blinking logic.
// @version     1.0.0
```

### The `window.StudioExtensions` API
Extensions interact with the editor by registering an object to the global `StudioExtensions` registry. The system will automatically inject an `id` into your script scope when loading.

### Boilerplate `.js` Extension
Save the following as `my_extension.js` and load it via the Extension Manager.

```javascript
// @name        Custom UI Logger
// @developer   Studio Team
// @description Logs a message to the console every time it renders.
// @version     1.1.0

(function() {
    // Define your extension module
    const MyExtension = {
        // Optional: Intercept the rendering of ANY node
        renderNode: function(ctx, node) {
            // Return true to OVERRIDE native drawing entirely.
            // Return false to let native drawing happen normally.
            
            if (node.type === 'head') {
                // Example: Draw a halo over the head
                ctx.save();
                ctx.strokeStyle = '#FCD34D';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.ellipse(0, -90, 40, 10, 0, 0, Math.PI*2);
                ctx.stroke();
                ctx.restore();
            }
            return false; 
        },

        // Required: Provide a cleanup function so the app doesn't break when uninstalled
        cleanup: function() {
            console.log("Extension successfully cleaned up and removed!");
        }
    };

    // Register module using the automatically provided 'id' variable
    window.StudioExtensions.register('ext_logger', MyExtension);
})();
```

---

## 12. Hot-Swappable Module Architecture

To prevent runtime errors or memory leaks during rapid development, Vector Studio utilizes a true hot-swapping module architecture.

- **Dynamic Database State:** When you upload an extension via the Extension Manager, the raw JS code and parsed metadata are permanently saved into an `IndexedDB` object store. This means extensions survive page refreshes natively.
- **Teardown & Garbage Collection:** When an extension is deleted via the UI, the engine fires a strict deletion protocol:
  1. Executes the extension's `cleanup()` hook (to remove React UI unmounts and event listeners).
  2. Purges the custom injected `<script>` tag violently from the HTML DOM.
  3. Deletes the physical file block out of IndexedDB.
  This zero-refresh hot-swapping allows constant iteration of scripts without corrupting the main `requestAnimationFrame` loop.

---

## 13. Data Management (Import/Export/Save)

The application handles project management entirely within the browser securely.

### Local Database (IndexedDB)
Clicking **Save Character** opens a prompt to name your design. The character's Scene Graph, alongside a Base64 thumbnail generated from the canvas, is saved to your browser's IndexedDB.

### Exporting and Importing (`.char`)
- **Exporting:** In the `File` menu, clicking **Export .char** serializes the active character data into a JSON string, creates an invisible anchor element, and prompts the browser to download a `.char` file.
- **Importing:** In the `File` menu, clicking **Import .char** reads a previously exported JSON payload, validates the format, and overwrites the active React state with the loaded Scene Graph, immediately rendering the imported character.
