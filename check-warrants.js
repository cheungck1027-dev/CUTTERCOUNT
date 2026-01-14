const axios = require('axios');

async function checkWarrant(code) {
  try {
    const url = `https://www.bnppwarrant.com/tc/warrant/${code}`;
    console.log(`\n檢查: ${code}`);
    
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    });
    
    const html = response.data;
    
    // 查找 product_name
    const nameMatch = html.match(/product_name\s*=\s*['"]([^'"]+)['"]/);
    if (nameMatch) {
      console.log(`窩輪名稱: ${nameMatch[1]}`);
    }
    
    // 查找 ucode
    const ucodeMatch = html.match(/var\s+ucode\s*=\s*['"]([^'"]+)['"]/);
    if (ucodeMatch) {
      console.log(`正股代碼: ${ucodeMatch[1]}`);
    }
    
  } catch (error) {
    console.error('錯誤:', error.message);
  }
}

(async () => {
  await checkWarrant('24413');
  await checkWarrant('24420');
  await checkWarrant('23296');
})();
