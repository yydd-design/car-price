const express = require('express');
const path = require('path');
const { scrapeAndCompare, loadHistory } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3978;

// 缓存 - 每30分钟刷新一次
let cachedData = null;
let lastFetch = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30分钟

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));

// API: 获取价格数据
app.get('/api/prices', async (req, res) => {
  try {
    const now = Date.now();
    if (!cachedData || (now - lastFetch) > CACHE_TTL) {
      console.log('缓存过期，重新爬取...');
      cachedData = await scrapeAndCompare();
      lastFetch = now;
    }
    
    // 按燃料类型过滤
    const { type } = req.query;
    let data = { ...cachedData };
    
    if (type && data[type]) {
      data = { ...data, cars: data[type], total: data[type].length };
    } else {
      // 合并所有
      const all = [...(data['燃油'] || []), ...(data['纯电'] || []), ...(data['混动'] || [])];
      data = { ...data, cars: all, total: all.length };
    }
    
    res.json({ success: true, data });
  } catch (e) {
    console.error('获取价格失败:', e.message);
    
    // 如果有缓存数据，即使过期也返回
    if (cachedData) {
      return res.json({ success: true, data: cachedData, stale: true });
    }
    
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: 手动触发刷新
app.post('/api/refresh', async (req, res) => {
  try {
    cachedData = await scrapeAndCompare();
    lastFetch = Date.now();
    res.json({ success: true, data: cachedData });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: 获取历史数据统计
app.get('/api/history', (req, res) => {
  try {
    const history = loadHistory();
    const stats = Object.entries(history).map(([id, data]) => ({
      id: parseInt(id),
      ...data,
    }));
    res.json({ success: true, data: stats });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚗 汽车价格查询系统启动：http://localhost:${PORT}`);
  console.log(`📊 数据每30分钟自动刷新一次`);
  console.log(`⏰ 首次启动正在爬取数据...`);
  
  // 首次启动时爬取
  scrapeAndCompare().then(data => {
    cachedData = data;
    lastFetch = Date.now();
    console.log(`✅ 首次数据爬取完成！共 ${data.total} 辆车`);
  }).catch(e => {
    console.error('❌ 首次爬取失败:', e.message);
  });
});
