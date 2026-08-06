const { chromium } = require('playwright');
const URLS = {
  carrefour:'https://www.carrefouruae.com/mafuae/en/search?keyword=parmigiano',
  waitrose:'https://www.waitrose.ae/en/search/?q=parmigiano',
};
(async()=>{
  const slug=process.argv[2]||'carrefour';
  const b=await chromium.launch({headless:true});
  const ctx=await b.newContext({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',locale:'en-AE',viewport:{width:1366,height:900},geolocation:{latitude:25.2048,longitude:55.2708},permissions:['geolocation']});
  const p=await ctx.newPage();
  await p.goto(URLS[slug],{waitUntil:'domcontentloaded',timeout:35000});
  await p.waitForTimeout(6000);
  const nd=await p.evaluate(()=>{const el=document.getElementById('__NEXT_DATA__');return el?el.textContent.length:0;});
  console.log('__NEXT_DATA__ length:', nd);
  const info=await p.evaluate(()=>{
    const out={};
    const tid=[...document.querySelectorAll('[data-testid]')].map(e=>e.getAttribute('data-testid'));
    const counts={}; tid.forEach(t=>counts[t]=(counts[t]||0)+1);
    out.topTestids=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,15);
    // product links
    const links=[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(h=>/product|\/p\/|\/pdp|-p-/i.test(h));
    out.productLinkSample=[...new Set(links)].slice(0,6);
    return out;
  });
  console.log(JSON.stringify(info,null,1));
  await b.close();
})().catch(e=>console.error(e));
