const fs=require('fs'), path=require('path');
const { splitSections } = require('./lib/sections.cjs');
const RAW=path.join(__dirname,'..','data','raw');
for (const file of process.argv.slice(2)) {
  const text=fs.readFileSync(path.join(RAW,file),'utf8');
  const s=splitSections(text);
  console.log(`\n=== ${file} (${text.length.toLocaleString()} chars) ===`);
  for (const [k,v] of Object.entries(s).sort((a,b)=>a[1].start-b[1].start)) {
    console.log(`  ${k.padEnd(7)} @${String(v.start).padStart(7)} len=${String(v.length).padStart(6)}  "${v.text.slice(0,72).replace(/\n/g,' ')}"`);
  }
}
