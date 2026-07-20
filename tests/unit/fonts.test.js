import { describe, expect, it } from "vitest";
import {
  formatSvgFontFamily,
  isCssFontKeyword,
  parseFontStack,
  resolveSvgFontFamily,
} from "../../src/converter/fonts.js";

describe("parseFontStack", () => {
  it("splits quoted and unquoted families", () => {
    expect(parseFontStack(`"IBM Plex Sans", system-ui, Segoe UI, sans-serif`)).toEqual([
      "IBM Plex Sans",
      "system-ui",
      "Segoe UI",
      "sans-serif",
    ]);
  });
});

describe("formatSvgFontFamily", () => {
  it("quotes names with spaces", () => {
    expect(formatSvgFontFamily("IBM Plex Sans")).toBe("'IBM Plex Sans'");
    expect(formatSvgFontFamily("sans-serif")).toBe("sans-serif");
  });
});

describe("resolveSvgFontFamily", () => {
  it("skips system-ui and Segoe UI", () => {
    expect(isCssFontKeyword("system-ui")).toBe(true);
    const family = resolveSvgFontFamily({
      fontFamily: "system-ui, Segoe UI, Helvetica, sans-serif",
      fontSize: "16px",
      fontWeight: "400",
      fontStyle: "normal",
    });
    // Without document.fonts, falls through to first non-hostile concrete name
    expect(family).toBe("Helvetica");
  });

  it("prefers a concrete name over keywords", () => {
    const family = resolveSvgFontFamily({
      fontFamily: `"IBM Plex Sans", system-ui, sans-serif`,
      fontSize: "14px",
      fontWeight: "normal",
      fontStyle: "normal",
    });
    expect(family).toBe("IBM Plex Sans");
  });
});

describe("textHasFallbackProneGlyphs", () => {
  it("detects chess symbols", async () => {
    const { textHasFallbackProneGlyphs } = await import("../../src/converter/fonts.js");
    expect(textHasFallbackProneGlyphs("♔")).toBe(true);
    expect(textHasFallbackProneGlyphs("Hello")).toBe(false);
  });
});
