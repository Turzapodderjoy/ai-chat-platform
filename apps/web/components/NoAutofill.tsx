"use client";

import { useEffect } from "react";

// Text-like fields only: checkboxes, radios, buttons, files and the rest
// have nothing a browser could autofill.
const FIELD_SELECTOR =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="range"]):not([type="color"]):not([type="image"]), textarea';

/** Stops the browser autofilling ANY input or search box in AIVA. Chrome
 * ignores autoComplete="off" (and even type="search") and drops the saved
 * login username into the first text-like field it finds -- which is how
 * the top-bar search ended up showing "goals911". Browsers never autofill a
 * read-only field, so every field is read-only until the user actually
 * focuses/clicks it. Mounted once in the root layout; a MutationObserver
 * covers panels and dialogs that mount later, so no individual input needs
 * its own fix. The sign-in form (`data-allow-autofill`) is the one
 * exception, so the browser can still offer to save/fill the login. */
export function NoAutofill() {
  useEffect(() => {
    function protect(field: HTMLInputElement | HTMLTextAreaElement) {
      if (field.dataset.noAutofill || field.closest("[data-allow-autofill]")) return;
      field.dataset.noAutofill = "1";
      const isPassword = field instanceof HTMLInputElement && field.type === "password";
      field.setAttribute("autocomplete", isPassword ? "new-password" : "off");
      field.setAttribute("data-lpignore", "true");
      field.setAttribute("data-1p-ignore", "true");
      // Already read-only on purpose, or already focused (autoFocus) and
      // being typed into: leave both alone.
      if (field.readOnly || document.activeElement === field) return;
      field.readOnly = true;
      const unlock = () => { field.readOnly = false; };
      field.addEventListener("focus", unlock);
      field.addEventListener("pointerdown", unlock);
    }
    function scan(root: ParentNode) {
      root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(FIELD_SELECTOR).forEach(protect);
    }
    scan(document);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches(FIELD_SELECTOR)) protect(node as HTMLInputElement | HTMLTextAreaElement);
          scan(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
