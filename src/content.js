import { elementToSvg } from "./converter/index.js";

const STATE_KEY = "__domToSvgInspect";
const ATTR = "data-dom-to-svg";

/**
 * Toggle DevTools-style inspect mode.
 * Hover highlights the element (box-model overlay) + DOM tooltip;
 * ↑ parent · ↓ first child · click to convert · Esc cancels.
 */
export function toggleInspect() {
  if (globalThis[STATE_KEY]?.active) {
    teardown();
    return;
  }
  start();
}

function start() {
  const state = {
    active: true,
    selected: null,
    layers: null,
    tooltip: null,
    hint: null,
    onMove: null,
    onClick: null,
    onKey: null,
    onScroll: null,
  };
  globalThis[STATE_KEY] = state;

  state.layers = createBoxModelLayers();
  document.documentElement.appendChild(state.layers.root);

  state.tooltip = createTooltip();
  document.documentElement.appendChild(state.tooltip);

  state.hint = createHint();
  document.documentElement.appendChild(state.hint);

  const refresh = () => {
    if (state.selected) paintTarget(state, state.selected);
  };

  state.onMove = (e) => {
    const t = pickTarget(e);
    if (!t || t === state.selected) return;
    state.selected = t;
    paintTarget(state, t);
  };

  state.onScroll = () => refresh();
  // Capture scroll on any scrollable ancestor
  window.addEventListener("scroll", state.onScroll, true);
  window.addEventListener("resize", state.onScroll, true);

  state.onClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const target = state.selected || pickTarget(e);
    teardown();
    if (!target) return;

    const toast = showToast("dom-to-svg: converting…");
    try {
      const svg = await elementToSvg(target);
      await exportSvg(svg, target);
      toast.textContent = "dom-to-svg: copied & downloaded";
      setTimeout(() => toast.remove(), 2200);
    } catch (err) {
      console.error("[dom-to-svg]", err);
      toast.textContent = `dom-to-svg: ${err.message || err}`;
      setTimeout(() => toast.remove(), 4000);
    }
  };

  state.onKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      teardown();
      return;
    }

    // Climb / descend like DevTools
    if (e.key === "ArrowUp" && state.selected) {
      e.preventDefault();
      const parent = state.selected.parentElement;
      if (parent && parent !== document.documentElement && parent !== document.body) {
        state.selected = parent;
        paintTarget(state, parent);
      } else if (parent === document.body || parent === document.documentElement) {
        state.selected = parent;
        paintTarget(state, parent);
      }
      return;
    }

    if (e.key === "ArrowDown" && state.selected) {
      e.preventDefault();
      const child = firstMeaningfulChild(state.selected);
      if (child) {
        state.selected = child;
        paintTarget(state, child);
      }
      return;
    }

    // Enter = convert current selection
    if (e.key === "Enter" && state.selected) {
      e.preventDefault();
      state.onClick(e);
    }
  };

  document.addEventListener("mousemove", state.onMove, true);
  document.addEventListener("click", state.onClick, true);
  document.addEventListener("keydown", state.onKey, true);

  // Cursor
  document.documentElement.style.cursor = "crosshair";
}

function teardown() {
  const state = globalThis[STATE_KEY];
  if (!state) return;
  document.removeEventListener("mousemove", state.onMove, true);
  document.removeEventListener("click", state.onClick, true);
  document.removeEventListener("keydown", state.onKey, true);
  window.removeEventListener("scroll", state.onScroll, true);
  window.removeEventListener("resize", state.onScroll, true);
  state.layers?.root?.remove();
  state.tooltip?.remove();
  state.hint?.remove();
  document.documentElement.style.cursor = "";
  globalThis[STATE_KEY] = null;
}

function createBoxModelLayers() {
  const root = document.createElement("div");
  root.setAttribute(ATTR, "layers");
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "2147483646",
    display: "none",
  });

  // DevTools-ish colors: margin orange, border yellow-ish, padding green, content blue
  const mk = (name, bg, border) => {
    const el = document.createElement("div");
    el.setAttribute(ATTR, name);
    Object.assign(el.style, {
      position: "fixed",
      boxSizing: "border-box",
      background: bg,
      border: border || "none",
      display: "none",
      top: "0",
      left: "0",
      margin: "0",
      padding: "0",
    });
    root.appendChild(el);
    return el;
  };

  return {
    root,
    margin: mk("margin", "rgba(246, 178, 107, 0.35)"),
    border: mk("border", "rgba(255, 229, 153, 0.45)"),
    padding: mk("padding", "rgba(147, 196, 125, 0.4)"),
    content: mk("content", "rgba(111, 168, 220, 0.45)", "1px solid rgba(66, 133, 244, 0.95)"),
  };
}

function createTooltip() {
  const el = document.createElement("div");
  el.setAttribute(ATTR, "tooltip");
  Object.assign(el.style, {
    position: "fixed",
    zIndex: "2147483647",
    display: "none",
    maxWidth: "min(480px, calc(100vw - 24px))",
    background: "#1e1e1e",
    color: "#e8e8e8",
    font: "11px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    padding: "8px 10px",
    borderRadius: "4px",
    boxShadow: "0 6px 28px rgba(0,0,0,.45)",
    pointerEvents: "none",
    border: "1px solid #333",
  });
  return el;
}

function createHint() {
  const el = document.createElement("div");
  el.setAttribute(ATTR, "hint");
  Object.assign(el.style, {
    position: "fixed",
    bottom: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "2147483647",
    background: "#1e1e1e",
    color: "#9cdcfe",
    font: "11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
    padding: "8px 12px",
    borderRadius: "4px",
    pointerEvents: "none",
    boxShadow: "0 4px 24px rgba(0,0,0,.4)",
    border: "1px solid #333",
    whiteSpace: "nowrap",
  });
  el.innerHTML =
    `<span style="color:#ce9178">dom-to-svg</span> · click / Enter convert · ` +
    `<span style="color:#dcdcaa">↑</span> parent · <span style="color:#dcdcaa">↓</span> child · Esc`;
  return el;
}

function paintTarget(state, el) {
  const rect = el.getBoundingClientRect();
  const cs = window.getComputedStyle(el);

  const mt = parseFloat(cs.marginTop) || 0;
  const mr = parseFloat(cs.marginRight) || 0;
  const mb = parseFloat(cs.marginBottom) || 0;
  const ml = parseFloat(cs.marginLeft) || 0;
  const bt = parseFloat(cs.borderTopWidth) || 0;
  const br = parseFloat(cs.borderRightWidth) || 0;
  const bb = parseFloat(cs.borderBottomWidth) || 0;
  const bl = parseFloat(cs.borderLeftWidth) || 0;
  const pt = parseFloat(cs.paddingTop) || 0;
  const pr = parseFloat(cs.paddingRight) || 0;
  const pb = parseFloat(cs.paddingBottom) || 0;
  const pl = parseFloat(cs.paddingLeft) || 0;

  // Content box (inside padding)
  const content = {
    top: rect.top + bt + pt,
    left: rect.left + bl + pl,
    width: Math.max(0, rect.width - bl - br - pl - pr),
    height: Math.max(0, rect.height - bt - bb - pt - pb),
  };
  // Padding edge = border box minus border
  const padding = {
    top: rect.top + bt,
    left: rect.left + bl,
    width: Math.max(0, rect.width - bl - br),
    height: Math.max(0, rect.height - bt - bb),
  };
  // Border box = getBoundingClientRect
  const border = {
    top: rect.top,
    left: rect.left,
    width: Math.max(0, rect.width),
    height: Math.max(0, rect.height),
  };
  // Margin box
  const margin = {
    top: rect.top - mt,
    left: rect.left - ml,
    width: Math.max(0, rect.width + ml + mr),
    height: Math.max(0, rect.height + mt + mb),
  };

  state.layers.root.style.display = "block";
  place(state.layers.margin, margin);
  place(state.layers.border, border);
  place(state.layers.padding, padding);
  place(state.layers.content, content);

  renderTooltip(state.tooltip, el, rect, cs);
}

function place(el, box) {
  Object.assign(el.style, {
    display: "block",
    top: `${box.top}px`,
    left: `${box.left}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  });
}

function renderTooltip(tooltip, el, rect, cs) {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${cssEscape(el.id)}` : "";
  const classes = el.classList?.length
    ? "." + [...el.classList].slice(0, 4).map(cssEscape).join(".")
    : "";
  const extraClass =
    el.classList?.length > 4 ? `.…+${el.classList.length - 4}` : "";

  const w = Math.round(rect.width * 10) / 10;
  const h = Math.round(rect.height * 10) / 10;

  const crumb = breadcrumb(el);
  const snippet = htmlSnippet(el);

  tooltip.style.display = "block";
  tooltip.innerHTML = [
    `<div style="margin-bottom:4px;word-break:break-all">`,
    `<span style="color:#569cd6">${esc(tag)}</span>`,
    id ? `<span style="color:#d7ba7d">${esc(id)}</span>` : "",
    classes ? `<span style="color:#4ec9b0">${esc(classes)}${esc(extraClass)}</span>` : "",
    `<span style="color:#808080"> ${w}×${h}</span>`,
    `</div>`,
    crumb
      ? `<div style="color:#858585;font-size:10px;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${crumb}</div>`
      : "",
    `<div style="color:#ce9178;font-size:10px;white-space:pre-wrap;word-break:break-all;max-height:4.5em;overflow:hidden;opacity:.95">${esc(snippet)}</div>`,
    `<div style="color:#6a9955;font-size:10px;margin-top:6px">${esc(shortStyle(cs))}</div>`,
  ].join("");

  // Position near element — prefer above; flip if clipped
  const tipW = Math.min(480, window.innerWidth - 24);
  const tipH = tooltip.offsetHeight || 80;
  let left = rect.left;
  let top = rect.top - tipH - 8;
  if (top < 8) top = rect.bottom + 8;
  if (left + tipW > window.innerWidth - 8) left = window.innerWidth - tipW - 8;
  if (left < 8) left = 8;
  if (top + tipH > window.innerHeight - 8) top = Math.max(8, window.innerHeight - tipH - 8);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function breadcrumb(el) {
  const parts = [];
  let cur = el;
  let depth = 0;
  while (cur && cur.nodeType === 1 && depth < 6) {
    if (cur === document.documentElement) break;
    parts.unshift(shortSelector(cur));
    cur = cur.parentElement;
    depth++;
  }
  return parts
    .map((p, i) => {
      const color = i === parts.length - 1 ? "#9cdcfe" : "#858585";
      return `<span style="color:${color}">${esc(p)}</span>`;
    })
    .join(`<span style="color:#555"> › </span>`);
}

function shortSelector(el) {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  const cls = el.classList?.[0];
  if (cls) return `${tag}.${cls}`;
  return tag;
}

function htmlSnippet(el) {
  // Prefer a readable opening tag + truncated inner text, not full outerHTML dump
  const tag = el.tagName.toLowerCase();
  const attrs = [];
  if (el.id) attrs.push(`id="${el.id}"`);
  if (el.classList?.length) {
    const cls = [...el.classList].slice(0, 5).join(" ");
    attrs.push(`class="${cls}${el.classList.length > 5 ? " …" : ""}"`);
  }
  // A couple other useful attrs
  for (const name of ["href", "src", "type", "name", "role", "aria-label"]) {
    if (el.hasAttribute?.(name)) {
      let v = el.getAttribute(name);
      if (v.length > 40) v = v.slice(0, 37) + "…";
      attrs.push(`${name}="${v}"`);
    }
  }

  const open = attrs.length ? `<${tag} ${attrs.join(" ")}>` : `<${tag}>`;
  const text = (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
    ? el.textContent
    : ""
  )
    .trim()
    .replace(/\s+/g, " ");
  if (text) {
    const body = text.length > 60 ? text.slice(0, 57) + "…" : text;
    return `${open}${body}</${tag}>`;
  }
  if (el.children.length) {
    return `${open}…${el.children.length} child${el.children.length === 1 ? "" : "ren"}…</${tag}>`;
  }
  return open.replace(/>$/, " />");
}

function shortStyle(cs) {
  const bits = [];
  if (cs.display && cs.display !== "inline") bits.push(`display: ${cs.display}`);
  if (cs.position && cs.position !== "static") bits.push(`position: ${cs.position}`);
  if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent") {
    bits.push(`bg: ${compactColor(cs.backgroundColor)}`);
  }
  return bits.slice(0, 3).join(" · ");
}

function compactColor(c) {
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return c;
  const hex = [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  return `#${hex}`;
}

function firstMeaningfulChild(el) {
  for (const child of el.children) {
    if (child.getAttribute?.(ATTR)) continue;
    const cs = window.getComputedStyle(child);
    if (cs.display === "none") continue;
    return child;
  }
  return null;
}

function pickTarget(e) {
  const stack = document.elementsFromPoint(e.clientX, e.clientY);
  for (const el of stack) {
    if (el?.getAttribute?.(ATTR)) continue;
    if (!(el instanceof Element)) continue;
    return el;
  }
  return null;
}

function showToast(text) {
  const el = document.createElement("div");
  el.setAttribute(ATTR, "toast");
  Object.assign(el.style, {
    position: "fixed",
    top: "12px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "2147483647",
    background: "#1e1e1e",
    color: "#e8e8e8",
    font: "12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
    padding: "8px 12px",
    borderRadius: "4px",
    pointerEvents: "none",
    boxShadow: "0 4px 24px rgba(0,0,0,.35)",
    border: "1px solid #333",
  });
  el.textContent = text;
  document.documentElement.appendChild(el);
  return el;
}

async function exportSvg(svg, el) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const tagName = el.tagName.toLowerCase();
  const id = el.id ? `-${el.id}` : "";
  a.download = `dom-to-svg-${tagName}${id}-${Date.now()}.svg`;
  a.href = url;
  a.rel = "noopener";
  document.documentElement.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  try {
    await navigator.clipboard.writeText(svg);
  } catch {
    /* download still succeeded */
  }
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cssEscape(ident) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(ident);
  return String(ident).replace(/([^\w-])/g, "\\$1");
}

export { elementToSvg };
