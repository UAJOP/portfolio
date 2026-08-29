const fs = require("fs");
const path = require("path");

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (file) => fs.readFileSync(path.join(__dirname, file), "utf8");
const exists = (file) => fs.existsSync(path.join(__dirname, file));
const size = (file) => fs.statSync(path.join(__dirname, file)).size;

const htmlFiles = fs.readdirSync(__dirname).filter((file) => file.endsWith(".html"));
const runtimeFiles = fs
  .readdirSync(__dirname)
  .filter((file) => /\.(?:html|css|js)$/.test(file))
  .filter((file) => !file.startsWith("qa-"));
const runtimeSources = runtimeFiles.map((file) => [file, read(file)]);

const quotedAssetPattern = /["']((?:https:\/\/kaanbalci\.com\/)?assets\/[^"']+)["']/g;
const referencedAssets = new Map();

runtimeSources.forEach(([file, source]) => {
  for (const match of source.matchAll(quotedAssetPattern)) {
    const asset = match[1]
      .replace("https://kaanbalci.com/", "")
      .split(/[?#]/)[0];
    if (!referencedAssets.has(asset)) referencedAssets.set(asset, new Set());
    referencedAssets.get(asset).add(file);
  }
});

referencedAssets.forEach((files, asset) => {
  check(exists(asset), `referenced asset is missing: ${asset} (${[...files].join(", ")})`);
});

let assetBackedImageCount = 0;
htmlFiles.forEach((file) => {
  const source = read(file);
  const imageTags = source.match(/<img\b[^>]*>/g) || [];
  imageTags.forEach((tag) => {
    const src = (tag.match(/\bsrc="([^"]+)"/) || [])[1] || "";
    if (!src.startsWith("assets/")) return;
    assetBackedImageCount += 1;
    check(/\bwidth="\d+"/.test(tag), `${file} image lacks intrinsic width: ${src}`);
    check(/\bheight="\d+"/.test(tag), `${file} image lacks intrinsic height: ${src}`);
    if (/\bfetchpriority="high"/.test(tag)) {
      check(!/\bloading="lazy"/.test(tag), `${file} high-priority image must not be lazy: ${src}`);
    }
  });
});

const profileAsset = "assets/kaan-balci-profile.webp";
const logoAsset = "assets/kaan-balci-logo-128.webp";
check(exists(profileAsset), "optimized profile image is missing");
check(exists(logoAsset), "optimized logo is missing");
if (exists(profileAsset)) check(size(profileAsset) <= 80 * 1024, "optimized profile image exceeds the 80 KB critical-asset budget");
if (exists(logoAsset)) check(size(logoAsset) <= 24 * 1024, "optimized logo exceeds the 24 KB critical-asset budget");

const index = read("index.html");
const about = read("about.html");
const findImageTag = (source, asset) =>
  (source.match(/<img\b[^>]*>/g) || []).find((tag) => tag.includes(`src="${asset}"`)) || "";
const indexProfile = findImageTag(index, profileAsset);
const aboutProfile = findImageTag(about, profileAsset);

check(Boolean(indexProfile), "homepage must use the optimized profile image");
check(/\bfetchpriority="high"/.test(indexProfile), "homepage profile image must remain high priority");
check(!/\bloading="lazy"/.test(indexProfile), "homepage profile image must not be lazy-loaded");
check(/\bdecoding="async"/.test(indexProfile), "homepage profile image must keep async decoding");
check(Boolean(aboutProfile), "about page must use the optimized profile image");
check(/\bloading="lazy"/.test(aboutProfile), "about profile image should remain below-fold lazy content");
check(!/\bfetchpriority="high"/.test(aboutProfile), "about profile image must not compete with the page heading at high priority");

htmlFiles.forEach((file) => {
  const source = read(file);
  check(!source.includes("assets/KAAN BALCI-KÜÇÜK LOGO PNG.png"), `${file} still ships the oversized navigation logo`);
});
[index, about].forEach((source, indexValue) => {
  check(!source.includes("assets/CV_foto_mavi.png"), `${indexValue === 0 ? "index.html" : "about.html"} still ships the large profile PNG`);
});

["works.html", "games.html"].forEach((file) => {
  const source = read(file);
  const cards = source.match(/<article\b[^>]*class="[^"]*project-card[^"]*"[\s\S]*?<\/article>/g) || [];
  cards.forEach((card) => {
    const image = (card.match(/<img\b[^>]*>/) || [])[0] || "";
    const src = (image.match(/\bsrc="([^"]+)"/) || [])[1] || "unknown";
    check(/\bloading="lazy"/.test(image), `${file} project card image must stay lazy: ${src}`);
  });
});

htmlFiles
  .filter((file) => file.includes("case-study"))
  .forEach((file) => {
    const source = read(file);
    const cards = source.match(/<(?:figure|article)\b[^>]*class="[^"]*case-gallery-card[^"]*"[\s\S]*?<\/(?:figure|article)>/g) || [];
    cards.forEach((card) => {
      const image = (card.match(/<img\b[^>]*>/) || [])[0] || "";
      const src = (image.match(/\bsrc="([^"]+)"/) || [])[1] || "unknown";
      check(/\bloading="lazy"/.test(image), `${file} gallery image must stay lazy: ${src}`);
    });
  });

// BRIEF 03 moved the runtime image policy out of legacy-script.js: fallbacks
// live in js/core/media.js and the lazy/priority pass in js/features/creative.js.
const legacyRuntime = [read("js/core/media.js"), read("js/features/creative.js")].join("\n");
const siteStyles = read("style.css");
const caseStudyStyles = read("case-study.css");

const ruleKeepsIntrinsicRatio = (source, selector) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escapedSelector}\\s*\\{[^}]*height:\\s*auto`, "s").test(source);
};

check(ruleKeepsIntrinsicRatio(siteStyles, ".profile-card img"), "profile-card CSS must keep intrinsic markup from changing its visual crop");
check(ruleKeepsIntrinsicRatio(siteStyles, ".about-photo img"), "about-photo CSS must keep intrinsic markup from changing its visual crop");
check(ruleKeepsIntrinsicRatio(caseStudyStyles, ".case-hero-visual img"), "case-study hero CSS must preserve its established aspect-ratio behavior");
check(ruleKeepsIntrinsicRatio(caseStudyStyles, ".case-gallery-card img"), "case-study gallery CSS must preserve its established aspect-ratio behavior");
check(
  legacyRuntime.includes('img.getAttribute("fetchpriority") !== "high"'),
  "legacy image policy must not add lazy loading to explicitly high-priority images",
);
check(!legacyRuntime.includes("index === 0 || img.closest"), "the first header logo must not receive automatic high priority");

[
  "assets/WarehouseWreckage main pp.png",
  "assets/DrivenfinityPng.png",
  "assets/converted_image.png",
  "assets/escape.jpg",
  "assets/111266f6-5226-4f00-aacc-efde413516ed.jpg",
].forEach((retiredSource) => {
  runtimeSources.forEach(([file, source]) => {
    check(!source.includes(retiredSource), `${file} still references retired heavy raster: ${retiredSource}`);
  });
});

check(!exists("assets/sinama-home-featured-case-study.webp"), "the byte-identical unreferenced SINAMA duplicate must stay removed");

if (failures.length) {
  console.error(`Asset policy failed with ${failures.length} issue(s):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Asset policy passed.");
console.log(`${referencedAssets.size} referenced assets exist · ${assetBackedImageCount} static images have intrinsic dimensions`);
console.log(`Critical assets: profile ${Math.round(size(profileAsset) / 1024)} KB · logo ${Math.round(size(logoAsset) / 1024)} KB`);
