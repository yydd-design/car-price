// 汽车价格爬虫 - 从懂车帝获取数据
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const PRICES_FILE = path.join(DATA_DIR, 'prices.json');

const API_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

// 燃料类型分类规则
function classifyFuelType(name, brand) {
  const upper = name.toUpperCase();
  const fullName = `${brand} ${name}`.toUpperCase();
  
  // ⚠️ 先检查混动关键词（避免 PHEV 被 EV 误判）
  // 混动：名称含 DM、PHEV、Hi4、混动、增程 等
  if (/\bPHEV\b/.test(upper) || name.toUpperCase().includes('PHEV')) return '混动';
  if (/\bDM\b/.test(upper) || /DM[-i]/.test(upper)) return '混动';
  if (name.includes('混动') || name.includes('增程')) return '混动';
  if (/\bHi4\b/.test(upper)) return '混动';
  
  // 再检查纯电关键词
  if (/\bEV\b/.test(upper) || /\bEV\d/.test(upper) || /\d+EV\b/.test(upper) || /EV$/.test(upper)) return '纯电';
  if (name.includes('纯电') || name.includes('电动')) return '纯电';
  
  // 按品牌/车型判断
  const evBrands = ['特斯拉', '蔚来', '小鹏', '极氪', 'AITO', 'ARCFOX极狐', '零跑汽车', '小米汽车'];
  const evModels = ['Model Y', 'Model 3', '小米SU7', '小米YU7', '星愿'];
  const hybridBrands = ['理想汽车', '腾势', '方程豹', '魏牌'];
  const hybridModels = ['大唐', '秦PLUS', '海豹', '钛7', '猛龙PLUS', '猛龙'];
  
  // 品牌级判断
  if (evBrands.includes(brand)) return '纯电';
  if (hybridBrands.includes(brand)) return '混动';
  
  // 车型级
  for (const model of evModels) {
    if (name.includes(model) || fullName.includes(model)) return '纯电';
  }
  for (const model of hybridModels) {
    if (name.includes(model)) return '混动';
  }
  
  // 默认：燃油
  return '燃油';
}

// 从懂车帝获取前N辆车
async function fetchTopCars(count = 60) {
  const allCars = [];
  
  for (let offset = 0; offset < count; offset += 20) {
    const url = `https://www.dongchedi.com/motor/pc/car/rank_data?aid=7&app_name=automobile&rank_name=monthly_sales&rank_type=1&offset=${offset}&count=20`;
    const res = await axios.get(url, { headers: API_HEADERS, timeout: 15000 });
    allCars.push(...res.data.data.list);
  }
  
  return allCars.slice(0, count).map((car, idx) => {
    const fuelType = classifyFuelType(car.series_name, car.brand_name);
    const priceStr = car.dealer_price || car.price || '';
    const prices = priceStr.split('-').map(p => parseFloat(p.trim()));
    
    return {
      id: car.series_id,
      rank: idx + 1,
      name: car.series_name,
      brand: car.brand_name,
      fuelType,
      guidePriceMin: car.min_price,
      guidePriceMax: car.max_price,
      dealerPrice: priceStr,
      dealerPriceMin: prices[0] || 0,
      dealerPriceMax: prices[1] || prices[0] || 0,
      hasDealerPrice: car.has_dealer_price,
      image: car.image,
      popularity: car.count,
      lastUpdated: new Date().toISOString(),
    };
  });
}

// 读取历史价格
function loadHistory() {
  try {
    if (fs.existsSync(PRICES_FILE)) {
      return JSON.parse(fs.readFileSync(PRICES_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('读取历史数据失败:', e.message);
  }
  return {};
}

// 保存历史价格
function saveHistory(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PRICES_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// 爬取并更新价格
async function scrapeAndCompare() {
  console.log(`[${new Date().toLocaleString()}] 开始爬取...`);
  
  // 爬取200辆车，确保能凑够燃油35 + 纯电35
  const cars = await fetchTopCars(200);
  const history = loadHistory();
  const now = new Date().toISOString();
  
  // 按燃料类型分组
  const grouped = { 燃油: [], 纯电: [], 混动: [] };
  
  cars.forEach(car => {
    const prev = history[car.id];
    const prevPrice = prev ? (prev.dealerPriceMin || 0) : null;
    const currentPrice = car.dealerPriceMin || car.guidePriceMin || 0;
    
    let change = 0;
    let changePercent = 0;
    let trend = 'first'; // first, up, down, stable
    
    if (prevPrice !== null && currentPrice > 0 && prevPrice > 0) {
      change = currentPrice - prevPrice;
      changePercent = (change / prevPrice) * 100;
      if (Math.abs(change) < 0.01) {
        trend = 'stable';
      } else if (change > 0) {
        trend = 'up';
      } else {
        trend = 'down';
      }
    }
    
    const record = {
      ...car,
      prevDealerPriceMin: prevPrice,
      prevDealerPriceMax: prev ? prev.dealerPriceMax : null,
      priceChange: Math.round(change * 100) / 100,
      priceChangePercent: Math.round(changePercent * 100) / 100,
      trend,
    };
    
    // 判断属于哪一组
    const group = grouped[car.fuelType] || grouped['燃油'];
    group.push(record);
    
    // 更新历史
    history[car.id] = {
      name: car.name,
      brand: car.brand,
      fuelType: car.fuelType,
      dealerPriceMin: car.dealerPriceMin,
      dealerPriceMax: car.dealerPriceMax,
      guidePriceMin: car.guidePriceMin,
      guidePriceMax: car.guidePriceMax,
      lastUpdated: now,
    };
  });
  
  saveHistory(history);
  
  const result = {
    updatedAt: now,
    total: cars.length,
    燃油: grouped['燃油'].slice(0, 35),
    纯电: grouped['纯电'].slice(0, 35),
    混动: grouped['混动'].slice(0, 20),
  };
  
  console.log(`完成！共 ${cars.length} 辆车 | 燃油:${grouped['燃油'].length} 纯电:${grouped['纯电'].length} 混动:${grouped['混动'].length}`);
  return result;
}

module.exports = { scrapeAndCompare, loadHistory, fetchTopCars, classifyFuelType };
