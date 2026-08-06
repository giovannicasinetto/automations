const { chromium } = require('playwright');
(async()=>{
  const b=await chromium.launch({headless:true});
  const ctx=await b.newContext({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',locale:'en-AE',viewport:{width:1366,height:900},geolocation:{latitude:25.2048,longitude:55.2708},permissions:['geolocation']});
  const p=await ctx.newPage();
  await p.goto('https://www.waitrose.ae/en/search/?q=parmigiano',{waitUntil:'domcontentloaded',timeout:35000});
  await p.waitForTimeout(6000);
  const out=await p.evaluate(()=>{
    const anchors=[...document.querySelectorAll('a[href*="/products/"]')];
    // find the product-card container: nearest ancestor that also contains a price
    const results=[];
    const seen=new Set();
    for(const a of anchors){
      const href=a.getAttribute('href'); if(seen.has(href))continue; seen.add(href);
      let node=a, card=null;
      for(let i=0;i<6&&node;i++){ node=node.parentElement;
        if(node && /AED|\d+\.\d{2}/.test(node.textContent)){ card=node; break; } }
      const txt=card?card.innerText.replace(/\s+/g,' ').trim():a.innerText.replace(/\s+/g,' ').trim();
      results.push({href, text:txt.slice(0,120)});
      if(results.length>=6)break;
    }
    return results;
  });
  console.log(JSON.stringify(out,null,1));
  await b.close();
})().catch(e=>console.error(e));
