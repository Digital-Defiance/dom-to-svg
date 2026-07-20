import { describe, expect, it } from "vitest";
import { roundedRectPath, shapeElement, insetRadii, borderStrokeAttrs } from "../../src/converter/borders.js";

const zero = { tl: { rx: 0, ry: 0 }, tr: { rx: 0, ry: 0 }, br: { rx: 0, ry: 0 }, bl: { rx: 0, ry: 0 } };
const uniform = { tl: { rx: 10, ry: 10 }, tr: { rx: 10, ry: 10 }, br: { rx: 10, ry: 10 }, bl: { rx: 10, ry: 10 } };
const mixed = {
  tl: { rx: 10, ry: 5 },
  tr: { rx: 20, ry: 20 },
  br: { rx: 0, ry: 0 },
  bl: { rx: 8, ry: 8 },
};

describe("roundedRectPath", () => {
  it("produces a closed path with arcs for mixed radii", () => {
    const d = roundedRectPath(0, 0, 100, 50, mixed);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.includes("A 20 20")).toBe(true);
    expect(d.includes("A 10 5")).toBe(true);
    expect(d.includes("A 8 8")).toBe(true);
  });

  it("degenerates arcs to lines when radius is 0", () => {
    const d = roundedRectPath(0, 0, 100, 50, zero);
    expect(d.includes("A ")).toBe(false);
  });
});

describe("shapeElement", () => {
  it("uses rect for sharp and uniform circular radii", () => {
    expect(shapeElement(0, 0, 10, 10, zero, { fill: "red" })).toContain("<rect");
    expect(shapeElement(0, 0, 10, 10, uniform, { fill: "red" })).toContain('rx="10"');
  });

  it("uses path for non-uniform radii", () => {
    expect(shapeElement(0, 0, 100, 50, mixed, { fill: "blue" })).toContain("<path");
  });
});

describe("insetRadii", () => {
  it("shrinks corner radii by border widths", () => {
    const inner = insetRadii(uniform, { t: 2, r: 2, b: 2, l: 2 });
    expect(inner.tl.rx).toBe(8);
    expect(inner.tl.ry).toBe(8);
  });

  it("never goes negative", () => {
    const inner = insetRadii(uniform, { t: 20, r: 20, b: 20, l: 20 });
    expect(inner.tl.rx).toBe(0);
  });
});

describe("borderStrokeAttrs", () => {
  it("detects uniform borders", () => {
    const info = borderStrokeAttrs({
      borderTopWidth: "2px",
      borderRightWidth: "2px",
      borderBottomWidth: "2px",
      borderLeftWidth: "2px",
      borderTopColor: "red",
      borderRightColor: "red",
      borderBottomColor: "red",
      borderLeftColor: "red",
      borderTopStyle: "solid",
      borderRightStyle: "solid",
      borderBottomStyle: "solid",
      borderLeftStyle: "solid",
    });
    expect(info.uniform).toBe(true);
  });

  it("detects non-uniform and missing sides", () => {
    const info = borderStrokeAttrs({
      borderTopWidth: "2px",
      borderRightWidth: "0px",
      borderBottomWidth: "2px",
      borderLeftWidth: "0px",
      borderTopColor: "red",
      borderRightColor: "red",
      borderBottomColor: "blue",
      borderLeftColor: "red",
      borderTopStyle: "solid",
      borderRightStyle: "none",
      borderBottomStyle: "solid",
      borderLeftStyle: "none",
    });
    expect(info.uniform).toBe(false);
    expect(info.sides).toEqual(["t", "b"]);
  });
});
