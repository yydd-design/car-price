const express = require('express');
const path = require('path');
const { scrapeAndCompare, loadHistory } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3978;

// 缓存
let cachedData = null;
let lastFetch = 0;
let loading = true;
let loadingError = null;
const CACHE_TTL = 30 * 60 * 1000; // 30分钟

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));

// API: 获取价格数据
app.get('/api/prices', (req, res) => {
  // 如果还在加载中，直接返回loading状态（不等待爬取）
  if (loading) {
    return res.json({ 
      success: true, 
      loading: true, 
      message: loadingError || '数据正在爬取中，请稍后刷新...',
      data: null 
    });
  }
  
  try {
    const now = Date.now();
    if ((now - lastFetch) > CACHE_TTL) {
      // 后台刷新，不阻塞请求
      console.log('缓存过期，后台重新爬取...');
      scrapeAndCompare().then(data => {
        cachedData = data;
        lastFetch = Date.now();
      }).catch(e => console.error('后台刷新失败:', e.message));
    }
    
    // 按燃料类型过滤
    const { type } = req.query;
    let data = { ...cachedData };
    
    if (type && data[type]) {
      data = { ...data, cars: data[type], total: data[type].length };
    } else {
      const all = [...(data['燃油'] || []), ...(data['纯电'] || []), ...(data['混动'] || [])];
      data = { ...data, cars: all, total: all.length };
    }
    
    res.json({ success: true, data });
  } catch (e) {
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
  console.log(`📊 后端启动完成，开始后台爬取数据...`);
  
  // 后台爬取，不阻塞启动
  scrapeAndCompare().then(data => {
    cachedData = data;
    lastFetch = Date.now();
    loading = false;
    console.log(`✅ 首次数据爬取完成！共 ${data.total} 辆车`);
  }).catch(e => {
    loadingError = e.message;
    loading = false;
    console.error('❌ 首次爬取失败:', e.message);
  });
  
  // 尽快标记启动完成（即使数据还没爬完）
  setTimeout(() => { loading = false; }, 3000);
});
