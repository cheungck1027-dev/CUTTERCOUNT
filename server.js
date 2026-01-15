const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

// 儲存用戶資料
const users = {
  'admin': 'admin123',
  'user1': 'pass1',
  'user2': 'pass2'
};

// 數據持久化文件路徑
const DATA_FILE = path.join(__dirname, 'data.json');

// 儲存窩輪牛熊資料
// 格式: { '窩輪號碼': { stockInfo: {...}, entries: [{...}] } }
let warrantsData = {};

// 從文件載入數據
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      const rawData = JSON.parse(data);
      
      // 轉換舊格式到新格式
      warrantsData = {};
      for (const [warrantNumber, value] of Object.entries(rawData)) {
        if (Array.isArray(value)) {
          // 舊格式：數組
          warrantsData[warrantNumber] = {
            stockInfo: null,
            entries: value
          };
        } else if (value && typeof value === 'object' && value.entries) {
          // 新格式
          warrantsData[warrantNumber] = value;
        }
      }
      
      console.log('✓ 數據已成功載入');
    } else {
      // 如果 data.json 不存在，使用初始數據
      try {
        const initialData = fs.readFileSync(path.join(__dirname, 'initial-data.json'), 'utf-8');
        warrantsData = JSON.parse(initialData);
        console.log('✓ 數據已成功載入 (使用初始數據)');
        console.log('載入的窩輪:', Object.keys(warrantsData));
      } catch (e) {
        console.log('ℹ️ 沒有初始數據文件，從空白開始');
        console.log('錯誤:', e.message);
        warrantsData = {};
      }
    }
  } catch (error) {
    console.error('載入數據失敗:', error.message);
    warrantsData = {};
  }
}

// 為沒有正股信息的窩輪補充信息
async function updateMissingStockInfo() {
  for (const warrantNumber of Object.keys(warrantsData)) {
    if (!warrantsData[warrantNumber].stockInfo) {
      console.log(`補充 ${warrantNumber} 的正股信息...`);
      const stockInfo = await fetchUnderlyingStock(warrantNumber);
      if (stockInfo) {
        warrantsData[warrantNumber].stockInfo = stockInfo;
        console.log(`✓ ${warrantNumber} 正股: ${stockInfo.code} ${stockInfo.name}`);
      }
      // 延遲避免請求過快
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  if (Object.keys(warrantsData).length > 0) {
    saveData();
    console.log('✓ 正股信息更新完成');
  }
}

// 保存數據到文件
function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(warrantsData, null, 2), 'utf-8');
  } catch (error) {
    console.error('✗ 保存數據失敗:', error.message);
  }
}

// 啟動時載入數據
loadData();

app.use(express.static('public'));
app.use(express.json());

// 非同步補充缺失的正股信息（不阻塞 server 啟動）
setImmediate(async () => {
  const warrantsToUpdate = Object.keys(warrantsData).filter(w => !warrantsData[w].stockInfo);
  if (warrantsToUpdate.length > 0) {
    console.log(`\n正在後台補充 ${warrantsToUpdate.length} 個窩輪的正股信息...`);
    for (const warrantNumber of warrantsToUpdate) {
      try {
        const stockInfo = await fetchUnderlyingStock(warrantNumber);
        if (stockInfo) {
          warrantsData[warrantNumber].stockInfo = stockInfo;
          console.log(`✓ 補充: ${warrantNumber} → ${stockInfo.code} ${stockInfo.name}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        console.error(`補充失敗: ${warrantNumber}`, error.message);
      }
    }
    saveData();
    console.log('✓ 正股信息補充完成\n');
  }
});

// 驗證輸入函數
function validateWarrantInput(data) {
  const { warrantNumber, username, gridsCut, gridsRecovery } = data;
  
  // 檢驗窩輪號碼（1-8個字符）
  if (!warrantNumber || typeof warrantNumber !== 'string') {
    return { valid: false, error: '窩輪號碼無效' };
  }
  
  const cleaned = warrantNumber.trim().replace(/[^a-zA-Z0-9]/g, '');
  if (!cleaned || cleaned.length > 8) {
    return { valid: false, error: '窩輪號碼格式錯誤' };
  }
  
  // 檢驗格數（非負整數）
  const cut = parseInt(gridsCut, 10);
  const recovery = parseInt(gridsRecovery, 10);
  
  if (isNaN(cut) || isNaN(recovery) || cut < 0 || recovery < 0) {
    return { valid: false, error: '格數必須為非負整數' };
  }
  
  if (cut === 0 && recovery === 0) {
    return { valid: false, error: '至少需要輸入斬了或回複的格數' };
  }
  
  return { valid: true, data: { warrantNumber: cleaned, gridsCut: cut, gridsRecovery: recovery } };
}

// 登入驗證
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '帳號或密碼不能為空' });
  }
  
  if (users[username] && users[username] === password) {
    res.json({ success: true, username });
  } else {
    res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
  }
});

// 排行榜 API - 按總數排序
app.get('/api/leaderboard', (req, res) => {
  try {
    console.log('Leaderboard API 被調用');
    console.log('當前窩輪數據:', Object.keys(warrantsData));
    
    const leaderboard = [];
  
  for (const [warrantNumber, warrantData] of Object.entries(warrantsData)) {
    const entries = warrantData.entries || [];
    const stockInfo = warrantData.stockInfo || {};
    
    // 計算總數（最大的淨虧損）
    const userNets = {};
    entries.forEach(entry => {
      if (entry && entry.timestamp) {
        if (!userNets[entry.username]) {
          userNets[entry.username] = 0;
        }
        userNets[entry.username] += entry.gridsCut - entry.gridsRecovery;
      }
    });
    
    const totalGrids = Object.keys(userNets).length > 0 ? Math.max(...Object.values(userNets)) : 0;
    
    if (totalGrids > 0 || entries.length > 0) {
      leaderboard.push({
        warrantNumber: warrantNumber,
        totalGrids: totalGrids,
        entryCount: entries.length,
        stockCode: stockInfo.code || 'N/A',
        stockName: stockInfo.name || 'N/A',
        warrantProductName: stockInfo.warrantProductName || ''
      });
    }
  }
  
  // 按總數降序排列
  leaderboard.sort((a, b) => b.totalGrids - a.totalGrids);
  
  console.log('返回排行榜數據:', leaderboard.length, '條');
  res.json(leaderboard);
  } catch (error) {
    console.error('排行榜 API 錯誤:', error);
    res.status(500).json({ error: error.message });
  }
});


// 香港股票名稱到代碼的映射表
const stockNameToCode = {
  // 常見股票
  '騰訊': '700',
  '騰訊控股': '700',
  '移動': '0941',
  '移': '0941',
  '中移': '0941',
  '中國移動': '0941',
  '紫國': '2259',
  '紫光國芯': '2259',
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

// 反向映射：代碼到名稱
const stockCodeToName = {};
for (const [name, code] of Object.entries(stockNameToCode)) {
  const paddedCode = code.padStart(5, '0');
  if (!stockCodeToName[paddedCode]) {
    stockCodeToName[paddedCode] = name;
  }
}

// 從 BNP 網址爬取正股信息
async function fetchUnderlyingStock(warrantCode) {
  try {
    // 優先使用 BNP 網址
    const url = `https://www.bnppwarrant.com/tc/warrant/${warrantCode}`;
    console.log(`正在爬取 BNP: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 8000
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    // 從 JavaScript 代碼中提取 ucode（正股代碼）
    const ucodeMatch = html.match(/var\s+ucode\s*=\s*['"]([^'"]+)['"]/);
    
    if (ucodeMatch) {
      const rawStockCode = ucodeMatch[1];
      const stockCode = rawStockCode.padStart(5, '0');
      console.log(`找到正股代碼: ${rawStockCode} → ${stockCode}`);
      
      // 抓取窩輪產品名稱（如"摩利寧德認購"）
      let warrantProductName = null;
      const productSpan = $('span.h4.d-md-block');
      if (productSpan.length > 0) {
        warrantProductName = productSpan.first().text().trim();
        console.log(`✓ 找到窩輪產品名稱: ${warrantProductName}`);
      }
      
      // 嘗試多種方式查找股票名稱
      let stockName = null;
      
      // 方法1：從反向映射表查找
      if (stockCodeToName[stockCode]) {
        stockName = stockCodeToName[stockCode];
        console.log(`✓ 從映射表找到: ${stockName}`);
      }
      
      // 方法2：從窩輪名稱推斷
      if (!stockName) {
        const title = $('title').text();
        const titleMatch = title.match(/^\d+\s+(.+?)\s+\(/);
        if (titleMatch) {
          const warrantName = titleMatch[1].trim();
          console.log(`窩輪名稱: ${warrantName}`);
          
          // 嘗試從窩輪名稱中提取正股名稱
          for (const [name, code] of Object.entries(stockNameToCode)) {
            if (warrantName.includes(name)) {
              stockName = name;
              console.log(`✓ 從窩輪名稱推斷: ${name}`);
              break;
            }
          }
        }
      }
      
      // 方法3：從"相關資產"區域提取
      if (!stockName) {
        const assetIndex = html.indexOf('相關資產');
        if (assetIndex !== -1) {
          const snippet = html.substring(assetIndex, assetIndex + 1000);
          // 查找格式 (xxxxx)名稱 或 類似的
          const nameMatch = snippet.match(/\(([^)]*)\)\s*([^\s<]+)/);
          if (nameMatch && nameMatch[2]) {
            stockName = nameMatch[2].trim();
            console.log(`✓ 從相關資產區域: ${stockName}`);
          }
        }
      }
      
      // 方法4：使用默認名稱（代碼）
      if (!stockName) {
        stockName = `正股${stockCode}`;
      }
      
      return {
        code: stockCode,
        name: stockName,
        warrantProductName: warrantProductName  // 新增窩輪產品名稱
      };
    }
    
    console.log('BNP 網址無法找到正股代碼，嘗試備用方案...');
    
    // 備用：使用 etnet 網址
    return await fetchUnderlyingStockFromEtnet(warrantCode);
    
  } catch (error) {
    console.error(`爬取 BNP 正股信息失敗 (${warrantCode}):`, error.message);
    // 備用方案
    return await fetchUnderlyingStockFromEtnet(warrantCode);
  }
}

// 備用：從 etnet 爬取
async function fetchUnderlyingStockFromEtnet(warrantCode) {
  try {
    const url = `https://www.etnet.com.hk/www/tc/warrants/realtime/quote.php?code=${warrantCode}`;
    console.log(`正在爬取 etnet: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 8000
    });
    
    const $ = cheerio.load(response.data);
    const title = $('title').text();
    const titleMatch = title.match(/^\d+\s+(.+?)\s+\(/);
    
    if (titleMatch) {
      const warrantName = titleMatch[1].trim();
      
      // 從窩輪名稱中提取正股名稱
      for (const [stockName, stockCode] of Object.entries(stockNameToCode)) {
        if (warrantName.includes(stockName)) {
          return {
            code: stockCode.padStart(5, '0'),
            name: stockName
          };
        }
      }
    }
    
    // 備用：使用第一個正股連結
    let stockLink = $('a[href*="/stocks/realtime/quote.php"]').first();
    if (stockLink.length > 0) {
      const href = stockLink.attr('href');
      const stockCode = href.match(/code=(\d+)/)?.[1];
      const fullText = stockLink.text().trim();
      
      if (stockCode) {
        let stockName = fullText
          .replace(/^\d+\s*/, '')
          .replace(/\(\d+\)$/, '')
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
    console.error(`爬取 etnet 正股信息失敗 (${warrantCode}):`, error.message);
    return null;
  }
}

// Socket.IO 連接處理
io.on('connection', (socket) => {
  console.log('用戶已連接');
  
  // 發送現有資料給新連接的用戶
  socket.emit('initial-data', warrantsData);
  
  // 接收新的窩輪資料
  socket.on('add-warrant', async (data) => {
    // 驗證輸入
    const validation = validateWarrantInput(data);
    if (!validation.valid) {
      socket.emit('error', { message: validation.error });
      return;
    }
    
    const { warrantNumber, gridsCut, gridsRecovery } = validation.data;
    const { username } = data;
    
    const now = new Date();
    const timestamp = now.getTime();
    const timeString = now.toLocaleString('zh-TW', { 
      timeZone: 'Asia/Hong_Kong',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    // 如果窩輪號碼不存在，創建新條目並爬取正股信息
    if (!warrantsData[warrantNumber]) {
      warrantsData[warrantNumber] = {
        stockInfo: null,
        entries: []
      };
      
      // 自動爬取正股信息
      console.log(`新窩輪 ${warrantNumber}，正在爬取正股信息...`);
      const stockInfo = await fetchUnderlyingStock(warrantNumber);
      
      if (stockInfo) {
        warrantsData[warrantNumber].stockInfo = stockInfo;
        console.log(`✓ 正股信息已保存: ${stockInfo.code} ${stockInfo.name}`);
      }
    }
    
    // 添加用戶的記錄
    warrantsData[warrantNumber].entries.push({
      username,
      gridsCut,
      gridsRecovery,
      time: timeString,
      timestamp: timestamp
    });
    
    // 按時間戳排序（最新的在前）
    warrantsData[warrantNumber].entries.sort((a, b) => b.timestamp - a.timestamp);
    
    // 保存數據
    saveData();
    
    // 廣播更新給所有連接的用戶
    io.emit('data-updated', warrantsData);
  });
  
  // 刪除記錄
  socket.on('delete-entry', (data) => {
    const { warrantNumber, timestamp } = data;
    
    if (warrantsData[warrantNumber]) {
      warrantsData[warrantNumber].entries = warrantsData[warrantNumber].entries.filter(e => e.timestamp !== timestamp);
      
      // 如果該窩輪號碼已無記錄，刪除該項
      if (warrantsData[warrantNumber].entries.length === 0) {
        delete warrantsData[warrantNumber];
      }
      
      saveData();
      io.emit('data-updated', warrantsData);
    }
  });
  
  // 清除全部數據 (僅 admin)
  socket.on('clear-all-data', (data) => {
    console.log('⚠️  收到清除全部數據請求');
    
    // 清空所有數據
    warrantsData = {};
    saveData();
    
    // 通知所有客戶端數據已清除
    io.emit('data-updated', warrantsData);
    io.emit('notification', {
      type: 'warning',
      message: '所有數據已被清除！'
    });
    
    console.log('✓ 已成功清除全部數據');
  });
  
  socket.on('disconnect', () => {
    console.log('用戶已斷開連接');
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
  console.log(`✓ 伺服器已啟動`);
  console.log(`  監聽: http://0.0.0.0:${PORT}`);
  
  // 只在本地開發環境顯示局域網IP，避免Replit上DNS超時
  if (process.env.NODE_ENV !== 'production') {
    try {
      const localIP = getLocalIP();
      console.log(`  局域網: http://${localIP}:${PORT}`);
    } catch (e) {
      // 忽略IP查詢錯誤
    }
  }
  
  console.log(`\n預設帳號:`);
  console.log(`  admin / admin123`);
  console.log(`  user1 / pass1`);
  console.log(`  user2 / pass2`);
});

// 獲取本地 IP 地址（僅在本地開發環境使用）
function getLocalIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}
