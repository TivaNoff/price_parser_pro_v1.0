const fs = require("fs");

const src = process.argv[2] || "product - 2026-05-25T154805.890.xml";
const CHUNK = Number(process.argv[3]) || 200;

const xml = fs.readFileSync(src, "utf8");

const offersStart = xml.indexOf("<offers>");
const offersEnd = xml.indexOf("</offers>");
if (offersStart === -1 || offersEnd === -1) {
  throw new Error("Invalid XML structure: missing <offers> block");
}

const header = `${xml.slice(0, offersStart + "<offers>".length)}\n`;
const footer = `\n${xml.slice(offersEnd)}`;
const offersBody = xml.slice(offersStart + "<offers>".length, offersEnd);

const offers = offersBody.match(/<offer\b[\s\S]*?<\/offer>/g) || [];
console.log(`Total offers: ${offers.length}`);

const base = src.replace(/\.xml$/i, "");
const pad = String(Math.ceil(offers.length / CHUNK)).length;

for (let i = 0; i < offers.length; i += CHUNK) {
  const chunk = offers.slice(i, i + CHUNK);
  const partNum = Math.floor(i / CHUNK) + 1;
  const from = i + 1;
  const to = i + chunk.length;
  const outName = `${base}-part${String(partNum).padStart(pad, "0")}-${from}-${to}.xml`;
  fs.writeFileSync(outName, header + chunk.join("\n") + footer, "utf8");
  console.log(`Written ${outName} (${chunk.length} offers)`);
}
