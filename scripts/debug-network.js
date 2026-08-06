// Debug: navigate a competitor search page and log every JSON/XHR response URL
// so we can see where product data actually comes from.
//   node scripts/debug-network.js spinneys parmigiano
const { chromium } = require('playwright');

const URLS = {
  spinneys:  q => `https://www.spinneys.com/en-ae/catalogue/search/?q=${encodeURIComponent(q)}`,
  waitrose:  q => `https://www.waitrose.ae/search?q=${encodeURIComponent(q)}`,
  grandiose: q => `https://www.grandiose.ae/catalogsearch/result/?q=${encodeURIComponent(q)}`,
  carrefour: q => `https://www.carrefouruae.com/mafuae/en/search?keyword=${encodeURIComponent(q)}`,
};

(async () => {
  const slug = process.argv[2] || 'spinneys';
  const q = process.argv[3] || 'parmigiano';
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    locale:'en-AE', viewport:{width:1366,height:900},
    geolocation:{latitude:25.2048,longitude:55.2708}, permissions:['geolocation'],
  });
  const page = await ctx.newPage();
  const seen = [];
  page.on('response', async r => {
    const ct = (r.headers()['content-type']||'');
    const url = r.url();
    if (ct.includes('json') || /search|product|catalog|graphql|algolia|api/i.test(url)) {
      let size=0; try{ const b=await r.body(); size=b.length; }catch{}
      seen.push({ status:r.status(), ct:ct.split(';')[0], size, url:url.slice(0,140) });
    }
  });
  console.log('goto', URLS[slug](q));
  try { await page.goto(URLS[slug](q), { waitUntil:'domcontentloaded', timeout:35000 }); } catch(e){ console.log('nav:',e.message); }
  await page.waitForTimeout(6000);
  console.log('final url:', page.url());
  console.log('title:', await page.title());
  console.log('\n--- JSON/API responses ---');
  for (const s of seen) console.log(`${s.status} ${String(s.size).padStart(7)}  ${s.ct.padEnd(20)} ${s.url}`);
  // also dump a bit of visible text to see if it's a bot wall
  const txt = (await page.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ').slice(0,240);
  console.log('\n--- body text (240ch) ---\n', txt);
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
