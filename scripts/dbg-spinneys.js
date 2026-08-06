const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch({headless:true});
  const ctx=await b.newContext({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',locale:'en-AE',viewport:{width:1366,height:900},geolocation:{latitude:25.2048,longitude:55.2708},permissions:['geolocation']});
  const p=await ctx.newPage();
  const algolia=[];
  p.on('response', r=>{ const u=r.url(); if(/algolia/i.test(u)) algolia.push(r.status()+' '+u.slice(0,110)); });
  // load homepage, find the search box, search "parmigiano"
  await p.goto('https://www.spinneys.com/en-ae/',{waitUntil:'domcontentloaded',timeout:35000});
  await p.waitForTimeout(4000);
  // try typing in a search input
  let searched=false;
  for(const sel of ['input[type="search"]','input[placeholder*="earch"]','#search','[data-testid*="search"] input']){
    const el=await p.$(sel);
    if(el){ await el.fill('parmigiano'); await el.press('Enter'); searched=true; console.log('used selector',sel); break; }
  }
  if(!searched) console.log('no search input found');
  await p.waitForTimeout(6000);
  console.log('final url:', p.url());
  const dom=await p.evaluate(()=>{
    const links=[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(h=>/product/i.test(h||''));
    const prices=[...document.querySelectorAll('*')].filter(e=>e.childElementCount===0&&/AED|\d+\.\d{2}/.test(e.textContent)).slice(0,4).map(e=>e.textContent.trim().slice(0,24));
    return {productLinks:[...new Set(links)].slice(0,6), priceSample:prices};
  });
  console.log('DOM:', JSON.stringify(dom,null,1));
  console.log('Algolia calls:', algolia.length); algolia.slice(0,5).forEach(a=>console.log('  ',a));
  await b.close();
})().catch(e=>console.error(e));
