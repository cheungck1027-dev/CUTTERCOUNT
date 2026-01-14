const axios = require('axios');
const cheerio = require('cheerio');

// 常見香港股票對應表
const stockNameToCode = {
  '騰訊': '700',
  '騰訊控股': '700',
  '阿里': '09988',
  '阿里巴巴': '09988',
  '恆生': '0066',
  '恒生': '0066',
  '中國平安': '02318',
  '中平': '02318',
  '工商銀行': '01398',
  '中國人壽': '02628',
  '中人壽': '02628',
  '中石油': '00857',
  '中石化': '00386',
  '金沙': '01928',
  '澳門金沙': '01928',
  '中國神華': '01088',
  '神華': '01088',
};

async function testScrape(warrantCode) {
  try {
    const url = `https://www.etnet.com.hk/www/tc/warrants/realtime/quote.php?code=${warrantCode}`;
    console.log(`測試爬取: ${url}\n`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 8000
    });
    
    const $ = cheerio.load(response.data);
    
    // 從頁面標題提取窩輪名稱
    const title = $('title').text();
    console.log('頁面標題:', title);
    
    // 從標題中提取窩輪名稱（通常在代碼和"("之間）
    const titleMatch = title.match(/^\d+\s+(.+?)\s+\(/);
    if (titleMatch) {
      const warrantName = titleMatch[1].trim();
      console.log('窩輪名稱:', warrantName);
      
      // 嘗試從窩輪名稱提取正股名稱
      for (const [stockName, stockCode] of Object.entries(stockNameToCode)) {
        if (warrantName.includes(stockName)) {
          console.log(`\n✓ 從窩輪名稱提取: ${stockName} → ${stockCode}`);
          
          // 驗證一下這個代碼是否在頁面上出現
          const stockLinks = [];
          $('a[href*="/stocks/realtime/quote.php"]').each((i, el) => {
            const href = $(el).attr('href');
            const code = href.match(/code=(\d+)/)?.[1];
            if (code === stockCode) {
              stockLinks.push($(el).text().trim());
            }
          });
          
          if (stockLinks.length > 0) {
            console.log(`頁面上找到該股票連結: ${stockLinks[0]}`);
          }
          break;
        }
      }
    }
    
  } catch (error) {
    console.error('錯誤:', error.message);
  }
}

testScrape('23296');









