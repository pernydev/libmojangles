<img src="https://forgejo.perny.dev/perny/libmojangles/media/branch/master/logo.png" alt="Libmojangles">

A TypeScript library that recreates Minecraft's font rendering stack for the web, pixel-perfect.

> **Note:** This project has been mostly developed by LLMs, but tested heavily against the game.

<img src="https://forgejo.perny.dev/perny/libmojangles/media/branch/master/headers/features.png" alt="Features">

- **Resource Pack Support** — Load Minecraft resource packs to use custom fonts, textures, and font definitions
- **Shader Pipeline** — Uses Minecraft's core shaders (vertex + fragment); supports custom shaders via resource packs
- **Text Component Parsing** — Full support for Minecraft JSON text components with colors, formatting, and nested extras
- **Component Bounding Boxes** — Get precise bounding boxes for each text component, useful for hit detection and tooltips
- **WebGL2 Rendering** — Hardware-accelerated text rendering with proper Unicode and bitmap font support

<img src="https://forgejo.perny.dev/perny/libmojangles/media/branch/master/headers/installation.png" alt="Installation">

```bash
bun add libmojangles
# or
npm install libmojangles
```

<img src="https://forgejo.perny.dev/perny/libmojangles/media/branch/master/headers/quick-start.png" alt="Quick Start">

```typescript
import { createLibmojangles, ResourcePackZIP } from "libmojangles";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const lib = createLibmojangles({ canvas });

// Load a resource pack from a zip file (e.g., Minecraft's assets or a custom pack)
const zipData = await fetch("/path/to/resourcepack.zip").then((r) =>
  r.arrayBuffer(),
);
const pack = await ResourcePackZIP.fromZip(zipData, "vanilla");
lib.addResourcePack(pack);

await lib.loadFont({ namespace: "minecraft", path: "default" });

lib.renderer.beginFrame();
lib.drawText("Hello World!", 10, 10, { scale: 2 });
lib.renderer.endFrame();
```

<img src="https://forgejo.perny.dev/perny/libmojangles/media/branch/master/headers/text-components.png" alt="Text Components">

Libmojangles supports Minecraft's JSON text component format:

```typescript
lib.drawText(
  {
    extra: [{ text: "Hello " }, { text: "World!", color: "gold", bold: true }],
  },
  10,
  10,
);
```

Supported properties: `text`, `extra`, `color`, `bold`, `italic`, `underlined`, `strikethrough`, `obfuscated`, `font`

<img src="https://forgejo.perny.dev/perny/libmojangles/media/branch/master/headers/api-overview.png" alt="API Overview">

### `createLibmojangles(options)`

Creates a new Libmojangles instance.

| Option        | Type                | Description                       |
| ------------- | ------------------- | --------------------------------- |
| `canvas`      | `HTMLCanvasElement` | Required. The canvas to render to |
| `defaultFont` | `ResourceLocation`  | Optional. Default font to use     |

### Instance Methods

| Method                           | Description                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `addResourcePack(pack)`          | Add a resource pack for fonts/textures/shaders                                    |
| `removeResourcePack(pack)`       | Remove a resource pack                                                            |
| `loadFont(id)`                   | Load a font by resource location                                                  |
| `drawText(text, x, y, options?)` | Draw text; returns `{ components }` with bounding boxes when `cachePicking: true` |
| `createTextMesh(text, options?)` | Create vertex data without rendering                                              |
| `pick(x, y)`                     | Get glyph info at screen position                                                 |
| `resize(width, height)`          | Resize the renderer                                                               |
| `dispose()`                      | Clean up resources                                                                |

<img src="https://forgejo.perny.dev/perny/libmojangles/media/branch/master/headers/development.png" alt="Development">

```bash
# Install dependencies
bun install

# Run dev server with playground
bun run dev

# Run tests
bun test
```

<img src="https://forgejo.perny.dev/perny/libmojangles/media/branch/master/headers/resource-packs.png" alt="Resource Packs">

You need Minecraft's vanilla assets or a compatible resource pack. The library expects the standard Minecraft resource pack structure:
