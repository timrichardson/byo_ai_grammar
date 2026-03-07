import type { SuggestionIssue } from "../shared/types";

const POPUP_ID = "writing-suggestions-popup";
let popup: HTMLDivElement | null = null;

function ensurePopup() {
  if (!popup) {
    popup = document.createElement("div");
    popup.id = POPUP_ID;
    popup.hidden = true;
    popup.style.position = "fixed";
    popup.style.zIndex = "2147483647";
    popup.style.minWidth = "240px";
    popup.style.maxWidth = "320px";
    popup.style.padding = "12px";
    popup.style.borderRadius = "14px";
    popup.style.background = "rgba(28, 36, 44, 0.96)";
    popup.style.color = "#f8fafc";
    popup.style.boxShadow = "0 18px 36px rgba(15, 23, 42, 0.32)";
    popup.style.fontFamily = '"IBM Plex Sans", "Segoe UI", sans-serif';
    document.documentElement.appendChild(popup);
  }
  return popup;
}

export function hidePopup() {
  const element = ensurePopup();
  element.hidden = true;
  element.replaceChildren();
}

export function showPopup(args: {
  issue: SuggestionIssue;
  anchorRect: DOMRect;
  onReplace: (replacement: string) => void;
  onPause: () => void;
  onIgnore: () => void;
  onAllow: () => void;
}) {
  const element = ensurePopup();
  element.replaceChildren();

  const title = document.createElement("div");
  title.textContent = args.issue.message;
  title.style.fontWeight = "600";
  title.style.marginBottom = "10px";
  element.appendChild(title);

  const list = document.createElement("div");
  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.gap = "8px";
  if (args.issue.suggestions.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "No replacement suggestion returned.";
    empty.style.color = "rgba(248, 250, 252, 0.8)";
    empty.style.fontSize = "14px";
    list.appendChild(empty);
  } else {
    for (const suggestion of args.issue.suggestions.slice(0, 3)) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = suggestion;
      button.style.border = "none";
      button.style.borderRadius = "10px";
      button.style.padding = "10px 12px";
      button.style.textAlign = "left";
      button.style.cursor = "pointer";
      button.style.background = "#f8fafc";
      button.style.color = "#102a43";
      button.addEventListener("click", () => args.onReplace(suggestion));
      list.appendChild(button);
    }
  }
  element.appendChild(list);

  const footer = document.createElement("div");
  footer.style.display = "flex";
  footer.style.gap = "8px";
  footer.style.marginTop = "12px";

  const ignoreButton = document.createElement("button");
  ignoreButton.type = "button";
  ignoreButton.textContent = "Ignore once";
  ignoreButton.style.border = "1px solid rgba(255,255,255,0.18)";
  ignoreButton.style.borderRadius = "999px";
  ignoreButton.style.padding = "8px 12px";
  ignoreButton.style.background = "transparent";
  ignoreButton.style.color = "#f8fafc";
  ignoreButton.addEventListener("click", args.onIgnore);

  const allowButton = document.createElement("button");
  allowButton.type = "button";
  allowButton.textContent = "Allow phrase";
  allowButton.style.border = "1px solid rgba(255,255,255,0.18)";
  allowButton.style.borderRadius = "999px";
  allowButton.style.padding = "8px 12px";
  allowButton.style.background = "transparent";
  allowButton.style.color = "#f8fafc";
  allowButton.addEventListener("click", args.onAllow);

  const pauseButton = document.createElement("button");
  pauseButton.type = "button";
  pauseButton.textContent = "Pause for this message";
  pauseButton.style.border = "1px solid rgba(255,255,255,0.18)";
  pauseButton.style.borderRadius = "999px";
  pauseButton.style.padding = "8px 12px";
  pauseButton.style.background = "transparent";
  pauseButton.style.color = "#f8fafc";
  pauseButton.addEventListener("click", args.onPause);

  footer.append(ignoreButton, allowButton, pauseButton);
  element.appendChild(footer);

  const left = Math.max(12, Math.min(window.innerWidth - 332, args.anchorRect.left));
  const top = Math.max(12, Math.min(window.innerHeight - 180, args.anchorRect.bottom + 8));
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
  element.hidden = false;
}
