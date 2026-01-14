const axios = require('axios');
const cheerio = require('cheerio');

// 香港股票名稱到代碼的映射表
const stockNameToCode = {
  '騰訊': '700',
  '騰訊控股': '700',
  '阿里': '09988',
  '阿里巴巴': '09988',
  '美團': '03690',
  '美团': '03690',
  '百度': '09888',
  '京東': '09618',
  '网易': '09999',
  '網易': '09999',
  '小米': '01810',
  '恆生': '0066',
  '恒生': '0066',
  '恆指': '0066',
  '恒指': '0066',
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
  '招商銀行': '03968',
  '南山': '00618',
  '格力': '06432',
  '吉利': '00175',
  '比亞迪': '01211',
  '比亚迪': '01211',
};

// 爬取正股信息
async function fetchUnderlyingStock(warrantCode) {
  try {
    const url = `https://www.etnet.com.hk/www/tc/warrants/realtime/quote.php?code=${warrantCode}`;
    console.log(`\n正在爬取: ${warrantCode}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      },
      timeout: 8000
    });
    
    const $ = cheerio.load(response.data);
    
    // 策略1：從頁面標題提取窩輪名稱，再從中提取正股名稱
    const title = $('title').text();
    const titleMatch = title.match(/^\d+\s+(.+?)\s+\(/);
    
    if (titleMatch) {
      const warrantName = titleMatch[1].trim();
      console.log(`窩輪名稱: ${warrantName}`);
      
      // 嘗試從窩輪名稱中提取正股名稱
      for (const [stockName, stockCode] of Object.entries(stockNameToCode)) {
        if (warrantName.includes(stockName)) {
          console.log(`✓ 從窩輪名稱提取: ${stockName} → ${stockCode}`);
          
          // 查詢該正股在頁面上的全名
          let fullStockName = stockName;
          $('a[href*="/stocks/realtime/quote.php"]').each((i, el) => {
            const href = $(el).attr('href');
            const code = href.match(/code=(\d+)/)?.[1];
            if (code === stockCode) {
              fullStockName = $(el).text().trim();
              return false; // 退出迴圈
            }
          });
          
          return {
            code: stockCode.padStart(5, '0'),
            name: fullStockName
          };
        }
      }
    }
    
    // 策略2（備用）：如果標題方法失敗，使用第一個正股連結
    let stockLink = $('a[href*="/stocks/realtime/quote.php"]').first();
    
    if (stockLink.length > 0) {
      const href = stockLink.attr('href');
      const stockCode = href.match(/code=(\d+)/)?.[1];
      const fullText = stockLink.text().trim();
      
      console.log(`[備用策略] 使用第一個正股連結: ${fullText}`);
      
      if (stockCode) {
        let stockName = fullText
          .replace(/^\d+\s*/, '')  // 去除開頭的數字
          .replace(/\(\d+\)$/, '') // 去除結尾的括號數字
          .trim();
        
        return {
          code: stockCode.padStart(5, '0'),
          name: stockName || fullText
        };
      }
    }
    
    console.log('未找到正股信息');
    return null;
  } catch (error) {
    console.error(`爬取正股信息失敗 (${warrantCode}):`, error.message);
    return null;
  }
}

// 測試多個窝輪
async function runTests() {
  const testCases = [
    { code: '23296', expected: '700' },  // 騰訊
    { code: '24413', expected: '?' },     // 未知
    { code: '24420', expected: '?' },     // 未知
  ];
  
  for (const test of testCases) {
    const result = await fetchUnderlyingStock(test.code);
    if (result) {
      console.log(`結果: ${result.code} ${result.name}`);
      if (test.expected !== '?') {
        const match = result.code === test.expected.padStart(5, '0') ? '✓' : '✗';
        console.log(`${match} 預期: ${test.expected}`);
      }
    } else {
      console.log('失敗: 無法獲取');
    }
  }
}

runTests();
