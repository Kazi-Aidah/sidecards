import { Editor } from "obsidian";

export function handleKeyWrap(event: KeyboardEvent, editorEl: HTMLElement, editor: Editor, enabled = true): boolean {
  if (!enabled) return false;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;

  const key = event.key;
  const wrapMap: Record<string, [string, string]> = {
    "[": ["[", "]"],
    "(": ["(", ")"],
    "{": ["{", "}"],
    "`": ["`", "`"],
    "%": ["%", "%"],
    "=": ["=", "="],
    '"': ['"', '"'],
  };

  const pair = wrapMap[key];
  if (!pair) return false;

  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;

  const range = sel.getRangeAt(0);
  if (!editorEl.contains(range.commonAncestorContainer)) return false;

  event.preventDefault();
  event.stopPropagation();

  const selectedText = range.toString();
  const [open, close] = pair;
  let newText = `${open}${selectedText}${close}`;

  // Upgrade logic
  if (key === "%") {
    if (selectedText.startsWith("%") && selectedText.endsWith("%") && !selectedText.startsWith("%%")) {
      const inner = selectedText.slice(1, -1).trim();
      newText = `%% ${inner} %%`;
    }
  } else if (key === "=") {
    if (selectedText.startsWith("=") && selectedText.endsWith("=") && !selectedText.startsWith("==")) {
      const inner = selectedText.slice(1, -1);
      newText = `==${inner}==`;
    }
  } else if (key === "[") {
    if (selectedText.startsWith("[") && selectedText.endsWith("]") && !selectedText.startsWith("[[")) {
      const inner = selectedText.slice(1, -1);
      newText = `[[${inner}]]`;
    }
  }

  range.deleteContents();
  const node = document.createTextNode(newText);
  range.insertNode(node);

  const newRange = document.createRange();
  if (selectedText.length === 0) {
    // No selection: place cursor between the pair
    newRange.setStart(node, open.length);
    newRange.collapse(true);
  } else {
    // Had selection: select the wrapped text
    newRange.selectNode(node);
  }
  sel.removeAllRanges();
  sel.addRange(newRange);

  return true;
}

export function isWordChar(char: string): boolean {
  return /[A-Za-z0-9_]/.test(char);
}

export function getWordRangeAtCaret(selection: Selection): Range | null {
  if (!selection.rangeCount) return null;
  const baseRange = selection.getRangeAt(0);
  if (!baseRange.collapsed) return baseRange;

  const node = baseRange.startContainer;
  if (!(node instanceof Text)) return null;
  const text = node.data;
  if (!text) return null;
  const offset = baseRange.startOffset;

  const leftChar = offset > 0 ? text[offset - 1] : "";
  const rightChar = offset < text.length ? text[offset] : "";
  if (!isWordChar(leftChar) && !isWordChar(rightChar)) return null;

  let start = offset;
  let end = offset;
  while (start > 0 && isWordChar(text[start - 1])) start--;
  while (end < text.length && isWordChar(text[end])) end++;

  const wordRange = document.createRange();
  wordRange.setStart(node, start);
  wordRange.setEnd(node, end);
  return wordRange;
}
