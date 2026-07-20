import { describe, expect, it } from "vitest";
import {
  escAttr,
  escText,
  parseLength,
  isTransparent,
  parseColor,
  parseRadiusCorner,
  getBorderRadii,
  isUniformRadius,
  cssTransformToSvg,
  tag,
} from "../../src/converter/utils.js";

describe("parseLength", () => {
  it("parses px, %, em, rem, pt", () => {
    expect(parseLength("10px")).toBe(10);
    expect(parseLength("50%", 200)).toBe(100);
    expect(parseLength("2em", 0, 16)).toBe(32);
    expect(parseLength("1rem")).toBe(16);
    expect(parseLength("12pt")).toBeCloseTo(16);
  });

  it("returns 0 for auto/none/empty", () => {
    expect(parseLength("auto")).toBe(0);
    expect(parseLength("none")).toBe(0);
    expect(parseLength("")).toBe(0);
    expect(parseLength(null)).toBe(0);
  });
});

describe("colors", () => {
  it("detects transparent", () => {
    expect(isTransparent("transparent")).toBe(true);
    expect(isTransparent("rgba(0, 0, 0, 0)")).toBe(true);
    expect(isTransparent("rgb(255, 0, 0)")).toBe(false);
    expect(parseColor("rgba(0,0,0,0)")).toBeNull();
    expect(parseColor("rgb(1,2,3)")).toBe("rgb(1,2,3)");
  });
});

describe("escaping", () => {
  it("escapes attrs and text", () => {
    expect(escAttr('a"b<c')).toContain("&quot;");
    expect(escText("a<b>&c")).toBe("a&lt;b&gt;&amp;c");
  });
});

describe("border radii", () => {
  it("parses elliptical corners", () => {
    const c = parseRadiusCorner("10px 20px", 100, 50, 16);
    expect(c.rx).toBe(10);
    expect(c.ry).toBe(20);
  });

  it("clamps overflowing adjacent radii", () => {
    const style = {
      fontSize: "16px",
      borderTopLeftRadius: "80px",
      borderTopRightRadius: "80px",
      borderBottomRightRadius: "0",
      borderBottomLeftRadius: "0",
    };
    const r = getBorderRadii(style, 100, 100);
    expect(r.tl.rx + r.tr.rx).toBeLessThanOrEqual(100.0001);
  });

  it("detects uniform circular radius", () => {
    const r = {
      tl: { rx: 8, ry: 8 },
      tr: { rx: 8, ry: 8 },
      br: { rx: 8, ry: 8 },
      bl: { rx: 8, ry: 8 },
    };
    expect(isUniformRadius(r)).toBe(true);
  });
});

describe("cssTransformToSvg", () => {
  it("maps matrix and matrix3d", () => {
    expect(cssTransformToSvg("none")).toBeNull();
    expect(cssTransformToSvg("matrix(1, 0, 0, 1, 0, 0)")).toBeNull();
    expect(cssTransformToSvg("matrix(0.866, 0.5, -0.5, 0.866, 10, 20)")).toBe(
      "matrix(0.866 0.5 -0.5 0.866 10 20)"
    );
    expect(cssTransformToSvg("matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 5,6,0,1)")).toBe(
      "matrix(1 0 0 1 5 6)"
    );
  });
});

describe("tag", () => {
  it("serializes void and paired elements", () => {
    expect(tag("rect", { x: 1, y: 2 })).toBe('<rect x="1" y="2"/>');
    expect(tag("text", { x: 0 }, "hi")).toBe('<text x="0">hi</text>');
  });
});
