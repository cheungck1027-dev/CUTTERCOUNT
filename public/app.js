let socket;
let currentUser = '';
let allData = {}; // 保存完整數據用於搜尋

// DOM 元素
const loginPage = document.getElementById('login-page');
const mainPage = document.getElementById('main-page');
const loginForm = document.getElementById('login-form');
const warrantForm = document.getElementById('warrant-form');
const loginError = document.getElementById('login-error');
const currentUserSpan = document.getElementById('current-user');
const logoutBtn = document.getElementById('logout-btn');
const adminControls = document.getElementById('admin-controls');
const clearAllDataBtn = document.getElementById('clear-all-data-btn');
const tableBody = document.getElementById('table-body');
const searchInput = document.getElementById('search-input');
const clearFilterBtn = document.getElementById('clear-filter-btn');

// 登入處理
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentUser = username;
            loginPage.style.display = 'none';
            mainPage.style.display = 'block';
            currentUserSpan.textContent = `用戶: ${currentUser}`;
            
            // 如果是 admin，顯示管理員控制項
            if (currentUser === 'admin') {
                adminControls.style.display = 'flex';
            } else {
                adminControls.style.display = 'none';
            }
            
            // 連接 Socket.IO
            connectSocket();
            
            loginError.textContent = '';
            loginForm.reset();
        } else {
            loginError.textContent = result.message || '登入失敗';
        }
    } catch (error) {
        loginError.textContent = '連接伺服器失敗';
        console.error('Login error:', error);
    }
});

// 清除全部數據 (僅 admin)
clearAllDataBtn?.addEventListener('click', () => {
    const confirmed = confirm(
        '⚠️ 警告!\n\n這將刪除所有窩輪和記錄。此操作無法撤銷！\n\n確定要清除全部數據嗎?'
    );
    
    if (confirmed) {
        const doubleConfirm = confirm(
            '再確認一次：你確定要清除全部數據嗎？\n\n所有數據將被永久刪除！'
        );
        
        if (doubleConfirm) {
            socket.emit('clear-all-data', {});
            console.log('已發送清除全部數據請求');
        }
    }
});

// 登出處理
logoutBtn.addEventListener('click', () => {
    if (socket) {
        socket.disconnect();
    }
    currentUser = '';
    loginPage.style.display = 'flex';
    mainPage.style.display = 'none';
    warrantForm.reset();
});

// 提交窩輪資料
warrantForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const warrantNumber = document.getElementById('warrant-number').value.trim();
    const gridsCut = parseInt(document.getElementById('grids-cut').value) || 0;
    const gridsRecovery = parseInt(document.getElementById('grids-recovery').value) || 0;
    
    if (warrantNumber && (gridsCut > 0 || gridsRecovery > 0) && currentUser) {
        socket.emit('add-warrant', {
            warrantNumber,
            username: currentUser,
            gridsCut,
            gridsRecovery
        });
        
        warrantForm.reset();
        document.getElementById('warrant-number').focus();
    }
});

// 搜尋功能 - 支持窝輪號碼、正股代碼、正股名稱
function performSearch() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    
    if (!searchTerm) {
        updateTable(allData);
        return;
    }
    
    const filtered = {};
    Object.keys(allData).forEach(warrantNumber => {
        const warrantData = allData[warrantNumber];
        const stockInfo = warrantData.stockInfo;
        
        // 檢查窝輪號碼是否匹配
        if (warrantNumber.toLowerCase().includes(searchTerm)) {
            filtered[warrantNumber] = warrantData;
            return;
        }
        
        // 檢查正股代碼是否匹配
        if (stockInfo && stockInfo.code && stockInfo.code.toLowerCase().includes(searchTerm)) {
            filtered[warrantNumber] = warrantData;
            return;
        }
        
        // 檢查正股名稱是否匹配
        if (stockInfo && stockInfo.name && stockInfo.name.toLowerCase().includes(searchTerm)) {
            filtered[warrantNumber] = warrantData;
            return;
        }
    });
    
    updateTable(filtered);
}

// 搜尋事件 - 即時搜尋
searchInput?.addEventListener('input', performSearch);
clearFilterBtn?.addEventListener('click', () => {
    searchInput.value = '';
    updateTable(allData);
});

// Socket.IO 連接
function connectSocket() {
    socket = io();
    
    // 接收初始資料
    socket.on('initial-data', (data) => {
        allData = data;
        updateTable(data);
    });
    
    // 接收資料更新
    socket.on('data-updated', (data) => {
        allData = data;
        performSearch(); // 重新搜尋以保持搜尋結果
    });
    
    // 接收錯誤信息
    socket.on('error', (errorData) => {
        alert('錯誤: ' + errorData.message);
    });
    
    socket.on('connect', () => {
        console.log('已連接到伺服器');
    });
    
    socket.on('disconnect', () => {
        console.log('已斷開連接');
    });
}

// 更新表格
function updateTable(data) {
    tableBody.innerHTML = '';
    
    const warrantNumbers = Object.keys(data);
    
    if (warrantNumbers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" class="no-data">暫無資料</td></tr>';
        return;
    }
    
    // 建立排序陣列，包含窩輪號碼和最新時間戳
    const sortedWarrants = warrantNumbers.map(warrantNumber => {
        const warrantData = data[warrantNumber];
        const entries = warrantData.entries || warrantData; // 兼容舊格式
        const timestamps = entries.filter(e => e && e.timestamp).map(e => e.timestamp);
        const latestTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : 0;
        return { warrantNumber, latestTimestamp };
    });
    
    // 按最新時間戳排序（最新的在前）
    sortedWarrants.sort((a, b) => b.latestTimestamp - a.latestTimestamp);
    
    sortedWarrants.forEach(({ warrantNumber }) => {
        const warrantData = data[warrantNumber];
        const entries = warrantData.entries || warrantData; // 兼容舊格式
        const stockInfo = warrantData.stockInfo;
        
        // 創建窩輪號碼行
        const row = document.createElement('tr');
        
        // A行: 窩輪牛熊號碼 + 正股信息
        const numberCell = document.createElement('td');
        numberCell.className = 'warrant-number';
        
        // 窩輪號碼
        const warrantSpan = document.createElement('div');
        warrantSpan.className = 'warrant-code';
        warrantSpan.textContent = `窝輪: ${warrantNumber}`;
        numberCell.appendChild(warrantSpan);
        
        // 正股信息（如果有）
        if (stockInfo && stockInfo.code) {
            const stockDiv = document.createElement('div');
            stockDiv.className = 'stock-info-inline';
            stockDiv.innerHTML = `<span class="stock-badge">正股: ${stockInfo.code}</span> <span class="stock-name-display">${stockInfo.name}</span>`;
            numberCell.appendChild(stockDiv);
        } else {
            const stockDiv = document.createElement('div');
            stockDiv.className = 'stock-info-inline no-stock';
            stockDiv.textContent = '正股: 待查詢...';
            numberCell.appendChild(stockDiv);
        }
        
        // B行: 計算總數
        const totalCell = document.createElement('td');
        totalCell.className = 'total-number';
        
        // 計算每個用戶的淨虧損 (斬 - 回複)，取最大值
        const userNets = {};
        entries.forEach(entry => {
            // 跳過元數據
            if (entry && entry.timestamp) {
                if (!userNets[entry.username]) {
                    userNets[entry.username] = 0;
                }
                userNets[entry.username] += entry.gridsCut - entry.gridsRecovery;
            }
        });
        
        const maxNet = Object.keys(userNets).length > 0 ? Math.max(...Object.values(userNets)) : 0;
        totalCell.textContent = maxNet > 0 ? maxNet : 0;
        
        // C行: 斬了麼 (所有用戶的記錄，按時間排序)
        const dataCell = document.createElement('td');
        
        // 已經在 server 端按時間戳排序，這裡直接顯示
        entries.forEach(entry => {
            // 跳過元數據
            if (!entry || !entry.timestamp) return;
            
            const entryDiv = document.createElement('div');
            entryDiv.className = 'user-entry';
            
            const username = document.createElement('span');
            username.className = 'username';
            username.textContent = entry.username;
            entryDiv.appendChild(username);
            
            // 顯示斬了多少格
            if (entry.gridsCut > 0) {
                const gridsSpan = document.createElement('span');
                gridsSpan.className = 'grids';
                gridsSpan.textContent = `(-${entry.gridsCut})`;
                entryDiv.appendChild(gridsSpan);
            }
            
            // 顯示回複了多少格
            if (entry.gridsRecovery > 0) {
                const recoverySpan = document.createElement('span');
                recoverySpan.className = 'recovery';
                recoverySpan.textContent = `(+${entry.gridsRecovery})`;
                entryDiv.appendChild(recoverySpan);
            }
            
            // 顯示時間
            const time = document.createElement('span');
            time.className = 'time';
            time.textContent = entry.time;
            entryDiv.appendChild(time);
            
            // 添加刪除按鈕（只允許 admin 或自己的記錄）
            if (currentUser === 'admin' || currentUser === entry.username) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                
                // 根據用戶身份設定提示信息
                if (currentUser === 'admin') {
                    deleteBtn.title = '作為 ADMIN，你可以刪除任何記錄';
                } else {
                    deleteBtn.title = '刪除你的記錄';
                }
                
                deleteBtn.innerHTML = '✕';
                deleteBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    let confirmMsg = '確定要刪除此記錄嗎？';
                    if (currentUser === 'admin' && currentUser !== entry.username) {
                        confirmMsg = `確定要刪除 ${entry.username} 的記錄嗎？`;
                    }
                    
                    if (confirm(confirmMsg)) {
                        socket.emit('delete-entry', {
                            warrantNumber,
                            timestamp: entry.timestamp
                        });
                    }
                };
                entryDiv.appendChild(deleteBtn);
            }
            
            dataCell.appendChild(entryDiv);
        });
        
        row.appendChild(numberCell);
        row.appendChild(totalCell);
        row.appendChild(dataCell);
        tableBody.appendChild(row);
    });
}
