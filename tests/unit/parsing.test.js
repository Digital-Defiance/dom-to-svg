import { describe, expect, it } from "vitest";
import {
  splitCssList,
  parseColorStops,
  cssGradientAngle,
  backgroundLayers,
} from "../../src/converter/gradients.js";
import { parseClipPath } from "../../src/converter/clip-path.js";
import {
  parseMatrix,
  isIdentityMatrix,
  multiply,
  matrixWithOrigin,
  matrixToSvg,
  parseTransformOrigin,
} from "../../src/converter/transform.js";
import { splitShadows } from "../../src/converter/box.js";
import { formatListMarker } from "../../src/converter/text.js";

describe("gradient parsing", () => {
  it("splits nested css lists", () => {
    expect(splitCssList("a, rgb(1, 2, 3), c")).toEqual(["a", " rgb(1, 2, 3)", " c"]);
  });

  it("parses color stops and skips angle tokens", () => {
    const stops = parseColorStops("to right, #fff, #000 50%, rgb(1,2,3)");
    expect(stops).toHaveLength(3);
    expect(stops[0].color).toBe("#fff");
    expect(stops[1].offset).toBe("50%");
  });

  it("maps css gradient angles", () => {
    expect(cssGradientAngle("to bottom")).toBe(180);
    expect(cssGradientAngle("to top")).toBe(0);
    expect(cssGradientAngle("90deg")).toBe(90);
    expect(cssGradientAngle("0.5turn")).toBe(180);
  });

  it("classifies background layers", () => {
    const layers = backgroundLayers({
      backgroundImage: "linear-gradient(red, blue), url(\"a.png\"), radial-gradient(circle, #fff, #000)",
    });
    expect(layers.map((l) => l.kind)).toEqual(["linear", "image", "radial"]);
  });
});

describe("clip-path parsing", () => {
  const box = { x: 10, y: 20, width: 100, height: 80 };

  it("parses circle", () => {
    const g = parseClipPath("circle(50% at 50% 50%)", box);
    expect(g).toContain("<circle");
    expect(g).toContain('cx="60"'); // 10 + 50
  });

  it("parses polygon", () => {
    const g = parseClipPath("polygon(0% 0%, 100% 0%, 50% 100%)", box);
    expect(g).toContain("<polygon");
    expect(g).toContain("10,20");
    expect(g).toContain("110,20");
    expect(g).toContain("60,100");
  });

  it("parses inset with round", () => {
    const g = parseClipPath("inset(10px 20px round 5px)", box);
    expect(g).toContain("<path");
  });

  it("parses path()", () => {
    const g = parseClipPath('path("M0 0h10v10z")', box);
    expect(g).toContain('d="M0 0h10v10z"');
    expect(g).toContain("translate(10 20)");
  });
});

describe("transforms", () => {
  it("parses matrices", () => {
    expect(parseMatrix("none")).toBeNull();
    expect(isIdentityMatrix(parseMatrix("matrix(1, 0, 0, 1, 0, 0)"))).toBe(true);
    const m = parseMatrix("matrix(2, 0, 0, 2, 5, 6)");
    expect(m).toEqual({ a: 2, b: 0, c: 0, d: 2, e: 5, f: 6 });
  });

  it("multiplies and applies origin", () => {
    const rot = { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 }; // 90deg-ish
    const withOrigin = matrixWithOrigin(rot, 50, 50);
    expect(withOrigin).not.toBeNull();
    expect(matrixToSvg(withOrigin)).toContain("matrix(");
  });

  it("parseTransformOrigin", () => {
    expect(parseTransformOrigin({ transformOrigin: "50% 50%" }, 100, 200)).toEqual({ ox: 50, oy: 100 });
    expect(parseTransformOrigin({ transformOrigin: "left top" }, 100, 200)).toEqual({ ox: 0, oy: 0 });
    expect(parseTransformOrigin({ transformOrigin: "right bottom" }, 100, 200)).toEqual({ ox: 100, oy: 200 });
  });

  it("multiply is associative for translate*scale", () => {
    const T = { a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 };
    const S = { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 };
    const TS = multiply(T, S);
    expect(TS.a).toBe(2);
    expect(TS.e).toBe(10);
  });
});

describe("box-shadow split", () => {
  it("parses multiple shadows", () => {
    const shadows = splitShadows("2px 2px 4px rgba(0,0,0,0.5), inset 0 0 3px red");
    expect(shadows).toHaveLength(2);
    expect(shadows[0].dx).toBe(2);
    expect(shadows[0].inset).toBe(false);
    expect(shadows[1].inset).toBe(true);
  });
});

describe("list markers", () => {
  it("formats common list styles", () => {
    expect(formatListMarker(0, "decimal")).toBe("1.");
    expect(formatListMarker(0, "disc")).toBe("•");
    expect(formatListMarker(1, "lower-alpha")).toBe("b.");
    expect(formatListMarker(3, "upper-roman")).toBe("IV.");
    expect(formatListMarker(0, "none")).toBe("");
  });
});
