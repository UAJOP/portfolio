#!/usr/bin/env node
/** Block material English prose that leaks unchanged into generated locale routes. */
import fs from "node:fs";
import path from "node:path";
import {
  ROOT, COMPANION_ROUTES, authoredHtmlFiles, indexableRoutes, loadProjectRegistry, loadRegistry, read,
} from "./i18n-catalog.mjs";
import { loadSiteRoutes, loadRouteRuntime } from "./site-routes.mjs";
import { loadMessageDomain } from "./i18n-messages.mjs";

const registry=loadRegistry();
const rootAt=process.argv.indexOf("--root");
const CHECK_ROOT=path.resolve(rootAt>=0?process.argv[rootAt+1]:ROOT);
if(!fs.existsSync(CHECK_ROOT)) throw new Error(`qa:rendered-locale-copy root does not exist: ${CHECK_ROOT}`);
const readArtifact=(file)=>fs.readFileSync(path.join(CHECK_ROOT,file),"utf8");
const routes=loadRouteRuntime(registry,loadSiteRoutes());
const all=[...indexableRoutes(loadProjectRegistry()),...COMPANION_ROUTES];
const locales=(registry.localizedRoutes?.generate||[]).filter((id)=>id!==registry.defaultLocale);
const failures=[];
let assertions=0;

const decode=(value)=>String(value).replaceAll("&quot;",'"').replaceAll("&#039;","'").replaceAll("&#39;","'").replaceAll("&#x27;","'").replaceAll("&#x22;",'"').replaceAll("&lt;","<").replaceAll("&gt;",">").replaceAll("&amp;","&").replace(/\s+/g," ").trim();
function visibleStrings(file){
  let html=readArtifact(file).replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<noscript[\s\S]*?<\/noscript>/gi," ").replace(/<title[\s\S]*?<\/title>/gi," ");
  const values=new Set();
  for(const match of html.matchAll(/>([^<>]+)</g)){const value=decode(match[1]);if(value)values.add(value);}
  for(const match of html.matchAll(/\b(?:aria-label|alt|title|placeholder)="([^"]*)"/g)){const value=decode(match[1]);if(value)values.add(value);}
  return values;
}
const official=new Set(["Google API Services User Data Policy","Legacy of the Lost","Google Sheets · CRM Update · Email Notify","(42 Saat) Sıfırdan Komple Java Geliştirici Kursu","Uygulama Geliştirerek C# Öğrenin: A’dan Z’ye Eğitim Seti","Build Responsive Real-World Websites with HTML and CSS","Unreal Engine 5 C++ Developer: Learn C++ & Make Video Games","Atıl Samancıoğlu · Academy Club","Introduction to Packet Tracer"]);
const technicalTokens=["Python","JavaScript","TypeScript","FastAPI","PostgreSQL","MySQL","MSSQL","SQLite","Firebase","GitHub","Phaser","Unity","Unreal","REST APIs","C#/.NET","n8n","Conversational AI","LLM","AI Flow","workflow automation","agent evaluation"];
function languageNeutral(value){
  if(official.has(value)) return true;
  if(/[{}\[\]]/.test(value)) return true;
  if(value.includes("Trigger →") || value.includes("Intent →")) return true;
  if((value.match(/,/g)||[]).length>=4 && technicalTokens.filter((token)=>value.includes(token)).length>=3) return true;
  return false;
}
function material(value){
  if(languageNeutral(value)) return false;
  const words=value.match(/[A-Za-zÀ-ÿ]+(?:[-'][A-Za-zÀ-ÿ]+)?/g)||[];
  if(words.length<4) return false;
  const lower=` ${value.toLowerCase()} `;
  const functionWords=[" the "," and "," to "," of "," in "," a "," an "," is "," are "," this "," that "," with "," for "," from "," into "," you "," your "," what "," how "," while "," through "," can "," should "," without "];
  return words.length>=6 || functionWords.some((word)=>lower.includes(word));
}
for(const route of all){
  const sourceFile=route.source;
  if(!fs.existsSync(path.join(CHECK_ROOT,sourceFile))) continue;
  const english=[...visibleStrings(sourceFile)].filter(material);
  for(const locale of locales){
    const localized=routes.documentPathFor(route.page,locale);
    assertions+=1;
    if(!fs.existsSync(path.join(CHECK_ROOT,localized))){failures.push(`${localized}: missing generated locale document`);continue;}
    const visible=visibleStrings(localized);
    for(const source of english){
      assertions+=1;
      if(visible.has(source)) failures.push(`${localized}: untranslated material copy: ${JSON.stringify(source)}`);
    }
  }
}
/* Stable-key bindings are exact, so short labels (below the prose threshold
 * above, e.g. the theme toggle's "Dark") are checked by key instead: every
 * text-only data-message-key element in a generated locale document must carry
 * that locale's message, on every route, not only the semantic-source pages. */
const messages=Object.fromEntries(["en",...locales].map((id)=>[id,loadMessageDomain(id,"common")]));
const keyedText=/<([a-z][a-z0-9]*)\b([^>]*\bdata-message-key="([^"]+)"[^>]*)>([^<]*)<\/\1>/g;
for(const file of authoredHtmlFiles()){
  const html=readArtifact(file);
  for(const match of html.matchAll(/<button\b[^>]*\bdata-theme-toggle\b[^>]*>/g)){
    assertions+=2;
    if(!/\bdata-message-aria-label-key="theme\.switchToLight"/.test(match[0])) failures.push(`${file}: theme toggle aria-label must bind data-message-aria-label-key="theme.switchToLight"`);
    if(!/\bdata-message-title-key="theme\.switchToLight"/.test(match[0])) failures.push(`${file}: theme toggle title must bind data-message-title-key="theme.switchToLight"`);
  }
  for(const match of html.matchAll(/<[^>]*\bdata-theme-label\b[^>]*>/g)){
    assertions+=1;
    if(!/\bdata-message-key="theme\.dark"/.test(match[0])) failures.push(`${file}: theme label must bind data-message-key="theme.dark" so every locale route is localized at build time`);
  }
}
const localizedDocuments=[...all.map((route)=>route.page)];
for(const locale of locales){
  for(const page of localizedDocuments){
    const localized=routes.documentPathFor(page,locale);
    if(!fs.existsSync(path.join(CHECK_ROOT,localized))) continue;
    const html=readArtifact(localized).replace(/<script[\s\S]*?<\/script>/gi," ");
    for(const [, , , key, text] of html.matchAll(keyedText)){
      const expected=messages[locale][key];
      if(typeof expected!=="string"||expected===messages.en[key]) continue;
      assertions+=1;
      if(decode(text)!==decode(expected)) failures.push(`${localized}: ${key} renders ${JSON.stringify(decode(text))}, expected ${JSON.stringify(expected)}`);
    }
  }
}

/* Accessible names are short, so the prose threshold above never sees them.
 * A localized document must not keep an English aria-label from its source.
 * KNOWN_ARIA_DEBT lists pre-existing game-shell leaks tracked for Master 3.
 * Anything not listed here fails. */
const KNOWN_ARIA_DEBT=new Set(["Game stats","Puzzle stats","AI workflow board","Kaan career merge mini game","Stroke thickness","Paint intensity","Export style","Joyday artwork preview"]);
const ariaLabels=(html)=>new Set([...html.matchAll(/\saria-label="([^"]+)"/g)].map((m)=>decode(m[1])));
for(const route of all){
  const sourceFile=route.source;
  if(!fs.existsSync(path.join(CHECK_ROOT,sourceFile))) continue;
  const english=[...ariaLabels(readArtifact(sourceFile))].filter((value)=>/^[A-Za-z][A-Za-z'’ -]*$/.test(value)&&value.trim().split(/\s+/).length>=2&&!languageNeutral(value));
  for(const locale of locales){
    const localized=routes.documentPathFor(route.page,locale);
    if(!fs.existsSync(path.join(CHECK_ROOT,localized))) continue;
    const labels=ariaLabels(readArtifact(localized));
    for(const value of english){
      if(KNOWN_ARIA_DEBT.has(value)) continue;
      assertions+=1;
      if(labels.has(value)) failures.push(`${localized}: untranslated aria-label ${JSON.stringify(value)}`);
    }
  }
}

/* Stable attribute keys must be present before runtime JavaScript executes.
 * Theme state can still relabel the control after boot, but every generated
 * document starts with the locale's light-theme action in both name sources. */
for(const locale of locales){
  const expected=messages[locale]["theme.switchToLight"];
  for(const page of localizedDocuments){
    const localized=routes.documentPathFor(page,locale);
    if(!fs.existsSync(path.join(CHECK_ROOT,localized))) continue;
    for(const match of readArtifact(localized).matchAll(/<button\b[^>]*\bdata-theme-toggle\b[^>]*>/g)){
      assertions+=2;
      const aria=match[0].match(/\baria-label="([^"]*)"/)?.[1];
      const title=match[0].match(/\btitle="([^"]*)"/)?.[1];
      if(decode(aria)!==decode(expected)) failures.push(`${localized}: theme toggle aria-label renders ${JSON.stringify(decode(aria))}, expected ${JSON.stringify(expected)}`);
      if(decode(title)!==decode(expected)) failures.push(`${localized}: theme toggle title renders ${JSON.stringify(decode(title))}, expected ${JSON.stringify(expected)}`);
    }
  }
}

/* Short UI labels fall below the prose threshold above, and a string that was
 * never added to the catalog passes through generation as English while pack
 * coverage still reads 100%. UI slots (section labels, buttons, status badges,
 * filter chips, definition labels, select options, image alt text) are copy by
 * construction, so an English slot string may survive in a locale only when a
 * reviewed source says so: a glossary name (protected term, project name or
 * language-neutral string), a common message whose locale value equals English
 * ("Build Log", a word the locale shares) or a historical pages identity. No
 * phrase list lives here; new copy gets a stable message key. Game routes are
 * checked on their portfolio shell only (header, footer, masthead); in-game
 * labels are runtime-localized and tracked as Master 3 debt. */
const SLOT_CLASS=/\b(?:eyebrow|btn|project-status|filter-btn)\b/;
const GAME_SOURCES=new Set(["adventure/index.html","joyday-paint/index.html","ai-flow-puzzle/index.html"]);
function slotStrings(html,shellOnly){
  html=html.replace(/<(script|style|noscript|title)\b[\s\S]*?<\/\1>/gi," ");
  if(shellOnly) html=[...html.matchAll(/<(header|footer)\b[\s\S]*?<\/\1>|<section[^>]*class="[^"]*page-hero[\s\S]*?<\/section>/g)].map((m)=>m[0]).join(" ");
  const out=new Set();
  for(const match of html.matchAll(/<(a|button|p|span|dt|option|th)\b([^>]*)>((?:<(?:i|span|svg)\b[^>]*>(?:<\/(?:i|span)>)?|[^<])*)<\/\1>/g)){
    const [,tag,attributes,inner]=match;
    const className=attributes.match(/\bclass="([^"]*)"/)?.[1]||"";
    if(!(SLOT_CLASS.test(className)||tag==="dt"||tag==="option"||tag==="th")) continue;
    const text=decode(inner.replace(/<[^>]+>/g," "));
    if(text&&/[A-Za-z]{2}/.test(text)) out.add(text);
  }
  for(const match of html.matchAll(/<img\b[^>]*\salt="([^"]+)"/g)) out.add(decode(match[1]));
  return out;
}
const glossary=JSON.parse(read("data/i18n/glossary.json"));
const glossaryNames=new Set([...(glossary.protectedTerms||[]),...(glossary.projectNames||[]),...(glossary.languageNeutralStrings||[])]);
const pagePacks=Object.fromEntries(locales.map((id)=>[id,JSON.parse(read(`data/i18n/packs/${id}/pages.json`))]));
const sourceDynamic=JSON.parse(read("data/i18n/source/dynamic.json"));
const dynamicPacks=Object.fromEntries(locales.map((id)=>[id,JSON.parse(read(`data/i18n/packs/${id}/dynamic.json`))]));
const reviewedDynamicIdentity=(locale,value)=>Object.entries(sourceDynamic.recruiterV2).some(([key,english])=>english===value&&dynamicPacks[locale].recruiterV2[key]===value);
const reviewedIdentity=(locale,value)=>glossaryNames.has(value)||reviewedDynamicIdentity(locale,value)||pagePacks[locale].text?.[value]===value||pagePacks[locale].attribute?.[value]===value||Object.entries(messages.en).some(([key,english])=>english===value&&messages[locale][key]===value);
for(const route of all){
  if(!fs.existsSync(path.join(CHECK_ROOT,route.source))) continue;
  const shellOnly=GAME_SOURCES.has(route.source);
  const english=slotStrings(readArtifact(route.source),shellOnly);
  for(const locale of locales){
    const localized=routes.documentPathFor(route.page,locale);
    if(!fs.existsSync(path.join(CHECK_ROOT,localized))) continue;
    const visible=slotStrings(readArtifact(localized),shellOnly);
    for(const value of english){
      assertions+=1;
      if(visible.has(value)&&!reviewedIdentity(locale,value)) failures.push(`${localized}: untranslated UI label ${JSON.stringify(value)} (give it a stable data-message-key in data/i18n/messages, or declare it in data/i18n/glossary.json if it is a name)`);
    }
  }
}

if(failures.length){
 console.error(`Rendered locale copy QA failed: ${failures.length} leak(s), ${assertions} assertions`);
 failures.slice(0,80).forEach((failure)=>console.error(`  x ${failure}`));
 if(failures.length>80) console.error(`  … ${failures.length-80} more`);
 process.exit(1);
}
console.log(`Rendered locale copy QA passed. ${assertions} assertions · no material English fallback in generated locales.`);
