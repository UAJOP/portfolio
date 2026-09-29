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
const routes=loadRouteRuntime(registry,loadSiteRoutes());
const all=[...indexableRoutes(loadProjectRegistry()),...COMPANION_ROUTES];
const locales=(registry.localizedRoutes?.generate||[]).filter((id)=>id!==registry.defaultLocale);
const failures=[];
let assertions=0;

const decode=(value)=>String(value).replaceAll("&quot;",'"').replaceAll("&#039;","'").replaceAll("&#39;","'").replaceAll("&lt;","<").replaceAll("&gt;",">").replaceAll("&amp;","&").replace(/\s+/g," ").trim();
function visibleStrings(file){
  let html=read(file).replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<noscript[\s\S]*?<\/noscript>/gi," ").replace(/<title[\s\S]*?<\/title>/gi," ");
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
  if(!fs.existsSync(path.join(ROOT,sourceFile))) continue;
  const english=[...visibleStrings(sourceFile)].filter(material);
  for(const locale of locales){
    const localized=routes.documentPathFor(route.page,locale);
    assertions+=1;
    if(!fs.existsSync(path.join(ROOT,localized))){failures.push(`${localized}: missing generated locale document`);continue;}
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
  const html=read(file);
  for(const match of html.matchAll(/<[^>]*\bdata-theme-label\b[^>]*>/g)){
    assertions+=1;
    if(!/\bdata-message-key="theme\.dark"/.test(match[0])) failures.push(`${file}: theme label must bind data-message-key="theme.dark" so every locale route is localized at build time`);
  }
}
const localizedDocuments=[...all.map((route)=>route.page)];
for(const locale of locales){
  for(const page of localizedDocuments){
    const localized=routes.documentPathFor(page,locale);
    if(!fs.existsSync(path.join(ROOT,localized))) continue;
    const html=read(localized).replace(/<script[\s\S]*?<\/script>/gi," ");
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
 * KNOWN_ARIA_DEBT lists pre-existing leaks tracked for Master 3: the theme
 * toggle (relabelled by the runtime after load) and game-shell internals.
 * Anything not listed here fails. */
const KNOWN_ARIA_DEBT=new Set(["Switch theme","Game stats","Puzzle stats","AI workflow board","Kaan career merge mini game","Stroke thickness","Paint intensity","Export style","Joyday artwork preview"]);
const ariaLabels=(html)=>new Set([...html.matchAll(/\saria-label="([^"]+)"/g)].map((m)=>decode(m[1])));
for(const route of all){
  const sourceFile=route.source;
  if(!fs.existsSync(path.join(ROOT,sourceFile))) continue;
  const english=[...ariaLabels(read(sourceFile))].filter((value)=>/^[A-Za-z][A-Za-z'’ -]*$/.test(value)&&value.trim().split(/\s+/).length>=2&&!languageNeutral(value));
  for(const locale of locales){
    const localized=routes.documentPathFor(route.page,locale);
    if(!fs.existsSync(path.join(ROOT,localized))) continue;
    const labels=ariaLabels(read(localized));
    for(const value of english){
      if(KNOWN_ARIA_DEBT.has(value)) continue;
      assertions+=1;
      if(labels.has(value)) failures.push(`${localized}: untranslated aria-label ${JSON.stringify(value)}`);
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
