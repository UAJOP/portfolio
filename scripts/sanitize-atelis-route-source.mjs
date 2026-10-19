#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const file = path.join(ROOT, "atelis-design-case-study", "index.html");

function removeElementById(html, id) {
  const startPattern = new RegExp(`<([a-z][\\w:-]*)\\b[^>]*\\bid=["']${id}["'][^>]*>`, "i");
  const start = startPattern.exec(html);
  if (!start) return html;
  const tag = start[1].toLowerCase();
  const token = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  token.lastIndex = start.index;
  let depth = 0;
  let match;
  while ((match = token.exec(html))) {
    const closing = match[0].startsWith("</");
    const selfClosing = /\/>$/.test(match[0]);
    if (closing) depth -= 1;
    else if (!selfClosing) depth += 1;
    if (depth === 0) return html.slice(0, start.index) + html.slice(token.lastIndex);
  }
  throw new Error(`Unbalanced <${tag}> while removing #${id}`);
}

let html = fs.readFileSync(file, "utf8");
for (const id of ["react-recruiter-root", "react-ajoop-root", "react-command-root"]) html = removeElementById(html, id);
html = html.replace(/<script id="react-[^"]+-props" type="application\/json">[\s\S]*?<\/script>/g, "");
html = html.replace(/<script type="module" src="\/assets-react\/[^"]+"><\/script>/g, "");
fs.writeFileSync(file, html);
console.log("Sanitized the committed Atelis fallback source; production React output remains authoritative.");
