/**
 * Bundled entry for chrome.scripting.executeScript (classic IIFE).
 * Avoids dynamic import() / web_accessible_resources, which Edge/CSP often block.
 */
import { toggleInspect } from "./content.js";

toggleInspect();
