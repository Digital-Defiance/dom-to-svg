import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      let path = decodeURIComponent(url.pathname);
      if (path === "/") path = "/tests/fixtures/cases.html";
      const filePath = join(root, path.replace(/^\//, ""));
      const data = await readFile(filePath);
      res.writeHead(200, {
        "content-type": MIME[extname(filePath)] || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function findChromeExecutable() {
  if (process.env.DOM_TO_SVG_CHROME) return process.env.DOM_TO_SVG_CHROME;

  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(tmpdir(), "cursor-sandbox-cache"),
    join(homedir(), "Library/Caches/ms-playwright"),
    join(homedir(), ".cache/ms-playwright"),
  ].filter(Boolean);

  const matches = [];

  async function walk(dir, depth = 0) {
    if (depth > 10) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "Frameworks" || ent.name === "Resources" || ent.name === "Helpers") continue;
        await walk(full, depth + 1);
      } else if (
        ent.name === "chrome-headless-shell" ||
        ent.name === "Google Chrome for Testing" ||
        ent.name === "Chromium" ||
        ent.name === "chrome"
      ) {
        matches.push(full);
      }
    }
  }

  for (const r of roots) await walk(r, 0);

  const preferred =
    matches.find((m) => m.includes("chrome-headless-shell") && m.includes("arm64")) ||
    matches.find((m) => m.includes("chrome-headless-shell")) ||
    matches.find((m) => m.includes("Chrome for Testing") && m.includes("arm64")) ||
    matches.find((m) => m.includes("Chrome for Testing")) ||
    matches[0];

  if (preferred) {
    await access(preferred);
    return preferred;
  }
  return null;
}

describe("browser: elementToSvg fixtures", () => {
  let server;
  let port;
  let browser;

  beforeAll(async () => {
    ({ server, port } = await startServer());
    const executablePath = await findChromeExecutable();
    if (!executablePath) {
      throw new Error(
        "No Chromium binary found. Run: npx playwright install chromium\n" +
          "Or set DOM_TO_SVG_CHROME to a chrome executable."
      );
    }
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }, 60000);

  afterAll(async () => {
    await browser?.close();
    await new Promise((r) => server.close(r));
  });

  async function convert(id, options = {}) {
    const page = await browser.newPage();
    page.on("pageerror", (err) => {
      console.error("[pageerror]", err.message);
    });
    await page.goto(`http://127.0.0.1:${port}/tests/fixtures/cases.html`, {
      waitUntil: "networkidle",
    });

    // Avoid Vitest rewriting import(): build dynamic import via Function
    const svg = await page.evaluate(
      async ({ id, options }) => {
        const dynImport = new Function("u", "return import(u)");
        const mod = await dynImport("/src/converter/index.js");
        const el = document.getElementById(id);
        if (!el) throw new Error("missing #" + id);
        return await mod.elementToSvg(el, Object.assign({ embedFonts: false }, options));
      },
      { id, options }
    );

    await page.close();
    return svg;
  }

  it("simple box → rect with fill", async () => {
    const svg = await convert("simple-box");
    expect(svg).toContain("<svg");
    expect(svg).toMatch(/<rect[^>]*fill="/);
    expect(svg).toMatch(/rx="12"/);
  });

  it("mixed border-radius → path with arcs", async () => {
    const svg = await convert("mixed-radius");
    expect(svg).toContain("<path");
    expect(svg).toMatch(/A /);
  });

  it("linear gradient → defs linearGradient", async () => {
    const svg = await convert("gradient-box");
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain("<stop");
    expect(svg).toMatch(/fill="url\(#/);
  });

  it("wrapped text → multiple text nodes", async () => {
    const svg = await convert("wrapped-text");
    const texts = svg.match(/<text\b/g) || [];
    expect(texts.length).toBeGreaterThanOrEqual(2);
    expect(svg).toContain("quick");
  });

  it("z-index stack paints higher z later", async () => {
    const svg = await convert("stack");
    const a = Math.max(svg.indexOf("#f87171"), svg.indexOf("rgb(248, 113, 113)"));
    const b = Math.max(svg.indexOf("#60a5fa"), svg.indexOf("rgb(96, 165, 250)"));
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
  });

  it("opacity nesting wraps group", async () => {
    const svg = await convert("opacity-nest");
    expect(svg).toMatch(/<g[^>]*opacity="0\.5"/);
  });

  it("rotated element gets transform matrix", async () => {
    const svg = await convert("rotated");
    expect(svg).toMatch(/transform="matrix\(/);
  });

  it("clip-path polygon → clipPath", async () => {
    const svg = await convert("clipped");
    expect(svg).toContain("<clipPath");
    expect(svg).toContain("<polygon");
  });

  it("overflow hidden → clipPath", async () => {
    const svg = await convert("overflow-box");
    expect(svg).toContain("<clipPath");
  });

  it("inline svg is cloned", async () => {
    const svg = await convert("with-svg");
    expect(svg).toContain("<circle");
    expect(svg).toMatch(/<path[^>]*d="M14/);
  });

  it("table cells produce text and boxes", async () => {
    const svg = await convert("table-card");
    expect(svg).toContain("Alpha");
    expect(svg).toContain("Beta");
    expect(svg).toMatch(/<rect|<path/);
  });

  it("box-shadow → filter", async () => {
    const svg = await convert("shadow-box");
    expect(svg).toContain("<filter");
    expect(svg).toMatch(/feDropShadow|feGaussianBlur/);
  });

  it("list markers appear", async () => {
    const svg = await convert("list-demo");
    expect(svg).toContain("First");
    expect(svg).toMatch(/1\.|•/);
  });

  it("canvas becomes image", async () => {
    const svg = await convert("canvas-demo");
    expect(svg).toContain("<image");
    expect(svg).toContain("data:image/png");
  });

  it("complex card is well-formed svg with text + gradient/radius", async () => {
    const svg = await convert("complex-card");
    expect(svg.startsWith("<?xml")).toBe(true);
    expect(svg).toContain("Quarterly Report");
    expect(svg).toContain("Updated");
    expect(svg).toMatch(/<linearGradient|<rect|<path/);
    expect(svg).toContain("</svg>");
  });
});
