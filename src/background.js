/**
 * Entry points: toolbar icon + right-click "Convert to SVG…"
 * Both inject the bundled inspect script (activeTab).
 */

const MENU_ID = "dom-to-svg-inspect";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Convert to SVG…",
      contexts: ["page", "frame", "selection", "link", "editable", "image", "video", "audio"],
    });
  });
});

chrome.action.onClicked.addListener((tab) => injectInspect(tab));

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) injectInspect(tab);
});

async function injectInspect(tab) {
  if (!tab?.id) return;
  const url = tab.url || "";
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("devtools://") ||
    url.startsWith("view-source:")
  ) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["dist/inject.js"],
    });
  } catch (err) {
    console.error("[dom-to-svg] inject failed:", err);
  }
}
