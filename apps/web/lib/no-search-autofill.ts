import { useEffect } from "react";

const SEARCH_SELECTOR = 'input[type="search"], input[name^="aiva-search"], input[name="aiva-topbar-search"]';

/** Stops the browser filling any search box with the saved login username.
 * Chrome ignores autoComplete="off" (and even type="search" on some
 * versions) and drops the username from the login form into the first
 * text-like field it finds -- which is how the top-bar search ended up
 * showing "goals911". Browsers never autofill a read-only field, so every
 * search input is read-only until the user actually focuses/clicks it.
 * Runs once for the whole dashboard (a MutationObserver picks up panels and
 * dialogs mounted later), so no individual search box needs its own fix. */
export function useNoSearchAutofill(): void {
  useEffect(() => {
    function protect(input: HTMLInputElement) {
      if (input.dataset.noAutofill) return;
      input.dataset.noAutofill = "1";
      input.setAttribute("autocomplete", "off");
      input.setAttribute("data-lpignore", "true");
      input.setAttribute("data-1p-ignore", "true");
      // An input that is already focused (autoFocus) is being typed into.
      if (document.activeElement !== input) input.readOnly = true;
      const unlock = () => { input.readOnly = false; };
      input.addEventListener("focus", unlock);
      input.addEventListener("pointerdown", unlock);
    }
    function scan(root: ParentNode) {
      root.querySelectorAll<HTMLInputElement>(SEARCH_SELECTOR).forEach(protect);
    }
    scan(document);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches(SEARCH_SELECTOR)) protect(node as HTMLInputElement);
          scan(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
}
