const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function testBnpScrape(warrantCode) {
  try {
    const url = `https://www.bnppwarrant.com/tc/warrant/${warrantCode}`;
    console.log(`\n測試新網址: ${url}\n`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 8000
    });
    
    const $ = cheerio.load(response.data);
    
    // 從 JavaScript 代碼中提取 ucode（正股代碼）
    const html = response.data;
    const ucodeMatch = html.match(/var\s+ucode\s*=\s*['"]([^'"]+)['"]/);
    
    if (ucodeMatch) {
      const stockCode = ucodeMatch[1];
      console.log(`✓ 找到正股代碼: ${stockCode}`);
      
      // 查找該代碼對應的股票名稱
      // 方法1：在頁面的股票連結中查找
      const stockLinks = [];
      $('a[href*="/market/technical-analysis/code/"]').each((i, el) => {
        const href = $(el).attr('href');
        const code = href.match(/code\/(\d+)/)?.[1];
        const nameEl = $(el).find('.widget-top-underlying-uname').first();
        const nameText = nameEl.length > 0 ? nameEl.text().trim() : null;
        
        if (code && nameText) {
          stockLinks.push({ code, name: nameText });
        }
      });
      
      // 在提取的股票列表中找到匹配的
      let matchedStock = null;
      for (const stock of stockLinks) {
        if (stock.code === stockCode.replace(/^0+/, '')) {
          matchedStock = stock;
          break;
        }
      }
      
      if (matchedStock) {
        console.log(`✓ 股票名稱: ${matchedStock.name}`);
        console.log(`\n結果: ${stockCode} ${matchedStock.name}`);
      } else {
        // 方法2：如果沒找到，嘗試從頁面其他位置提取名稱
        console.log('在頁面股票列表中未找到，嘗試查找相關資產...');
        
        // 查找包含"相關資產"的區域，並提取其後的股票信息
        const assetIndex = html.indexOf('相關資產');
        if (assetIndex !== -1) {
          const snippet = html.substring(assetIndex, assetIndex + 1000);
          console.log('相關資產區域:\n' + snippet.substring(0, 200) + '...');
        }
      }
      
    } else {
      console.log('✗ 未能找到正股代碼');
    }
    
  } catch (error) {
    console.error('錯誤:', error.message);
  }
}

// 測試多個窩輪
testBnpScrape('24413');
