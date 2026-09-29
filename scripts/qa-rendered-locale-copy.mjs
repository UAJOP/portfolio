#!/usr/bin/env node
/** Block material English prose that leaks unchanged into generated locale routes. */
import fs from "node:fs";
import path from "node:path";
import {
  ROOT, COMPANION_ROUTES, indexableRoutes, loadProjectRegistry, loadRegistry, read,
} from "./i18n-catalog.mjs";
import { loadSiteRoutes, loadRouteRuntime } from "./site-routes.mjs";

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
if(failures.length){
 console.error(`Rendered locale copy QA failed: ${failures.length} leak(s), ${assertions} assertions`);
 failures.slice(0,80).forEach((failure)=>console.error(`  x ${failure}`));
 if(failures.length>80) console.error(`  … ${failures.length-80} more`);
 process.exit(1);
}
console.log(`Rendered locale copy QA passed. ${assertions} assertions · no material English fallback in generated locales.`);
