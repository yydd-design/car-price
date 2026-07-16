let allData = null;
let currentType = 'all';
let currentFilter = '';

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadData();
});

// 加载数据
async function loadData() {
  const body = document.getElementById('tableBody');
  body.innerHTML = '<tr><td colspan="8" class="loading">⏳ 正在爬取最新价格数据...</td></tr>';
  
  try {
    const res = await fetch('/api/prices');
    const json = await res.json();
    
    if (!json.success) throw new Error(json.error);
    
    allData = json.data;
    document.getElementById('updateTime').textContent = `📅 更新于 ${formatTime(allData.updatedAt)}`;
    
    render();
  } catch (e) {
    body.innerHTML = `<tr><td colspan="8" class="loading">❌ 加载失败: ${e.message}</td></tr>`;
  }
}

// 手动刷新
async function refreshData() {
  const btn = document.getElementById('refreshBtn');
  btn.disabled = true;
  btn.textContent = '⏳ 爬取中...';
  
  try {
    const res = await fetch('/api/refresh', { method: 'POST' });
    const json = await res.json();
    
    if (json.success) {
      allData = json.data;
      document.getElementById('updateTime').textContent = `📅 更新于 ${formatTime(allData.updatedAt)}`;
      render();
    } else {
      alert('刷新失败: ' + (json.error || '未知错误'));
    }
  } catch (e) {
    alert('刷新失败: ' + e.message);
  }
  
  btn.disabled = false;
  btn.textContent = '🔄 手动刷新';
}

// 切换燃料类型
function switchType(type) {
  currentType = type;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-type="${type}"]`).classList.add('active');
  render();
}

// 搜索过滤
function filterCars() {
  currentFilter = document.getElementById('searchInput').value.trim().toLowerCase();
  render();
}

// 获取当前要显示的车列表
function getCars() {
  if (!allData) return [];
  
  let cars = [];
  if (currentType === 'all') {
    cars = [...(allData['燃油'] || []), ...(allData['纯电'] || []), ...(allData['混动'] || [])];
  } else if (currentType === 'gas') {
    cars = allData['燃油'] || [];
  } else if (currentType === 'ev') {
    cars = allData['纯电'] || [];
  } else if (currentType === 'hybrid') {
    cars = allData['混动'] || [];
  }
  
  if (currentFilter) {
    cars = cars.filter(c => 
      c.name.toLowerCase().includes(currentFilter) ||
      c.brand.toLowerCase().includes(currentFilter)
    );
  }
  
  return cars;
}

// ====== 列表渲染 ======
function render() {
  const cars = getCars();
  const body = document.getElementById('tableBody');
  const summary = document.getElementById('summary');
  
  if (cars.length === 0) {
    body.innerHTML = '<tr><td colspan="8" class="no-result">没有找到匹配的车型</td></tr>';
    summary.innerHTML = `<div class="stat">共 0 辆车</div>`;
    return;
  }
  
  const upCount = cars.filter(c => c.trend === 'up').length;
  const downCount = cars.filter(c => c.trend === 'down').length;
  const stableCount = cars.filter(c => c.trend === 'stable').length;
  const firstCount = cars.filter(c => c.trend === 'first').length;
  
  summary.innerHTML = `
    <div class="stat">共 <strong>${cars.length}</strong> 辆车</div>
    <div class="stat" style="color:#f5222d">📈 涨价 ${upCount}</div>
    <div class="stat" style="color:#52c41a">📉 降价 ${downCount}</div>
    <div class="stat" style="color:#8c8c8c">➖ 持平 ${stableCount}</div>
    <div class="stat" style="color:#1890ff">● 首次 ${firstCount}</div>
  `;
  
  body.innerHTML = cars.map((car, i) => {
    const carData = encodeURIComponent(JSON.stringify(car));
    return `<tr class="clickable-row" onclick="showDetail('${carData}')">
      <td class="col-rank">${car.rank}</td>
      <td class="col-img">${car.image ? `<img src="${car.image}" alt="${car.name}" loading="lazy" onerror="this.outerHTML='<div class=car-img-placeholder>🚗</div>'">` : '<div class="car-img-placeholder">🚗</div>'}</td>
      <td class="col-name"><strong>${car.name}</strong></td>
      <td class="col-brand">${car.brand}</td>
      <td class="col-type">${getTypeBadge(car.fuelType)}</td>
      <td class="col-price">
        <span class="price-main">${formatPrice(car.dealerPriceMin)}</span>
        ${car.dealerPriceMax > car.dealerPriceMin ? `<span class="price-range">~ ${formatPrice(car.dealerPriceMax)}</span>` : ''}
        <div class="price-range">指导价: ${car.guidePriceMin}~${car.guidePriceMax}万</div>
      </td>
      <td class="col-change ${getTrendClass(car.trend)}">
        ${getTrendArrow(car.trend)}
      </td>
      <td class="col-pct ${getTrendClass(car.trend)}">
        ${getTrendText(car)}
      </td>
    </tr>`;
  }).join('');
}

// ====== 详情页 ======
function showDetail(encodedCar) {
  const car = JSON.parse(decodeURIComponent(encodedCar));
  
  // 切换视图
  document.getElementById('listView').style.display = 'none';
  document.getElementById('detailView').style.display = 'block';
  
  // 填充信息
  document.getElementById('detailTitle').textContent = car.name;
  document.getElementById('detailImage').src = car.image || '';
  document.getElementById('detailImage').alt = car.name;
  document.getElementById('detailName').textContent = car.name;
  document.getElementById('detailBrand').textContent = car.brand;
  document.getElementById('detailType').innerHTML = getTypeBadge(car.fuelType);
  document.getElementById('detailRank').textContent = `#${car.rank}`;
  
  // 价格
  document.getElementById('detailPrice').textContent = formatPrice(car.dealerPriceMin);
  const rangeEl = document.getElementById('detailRange');
  if (car.dealerPriceMax > car.dealerPriceMin) {
    rangeEl.textContent = `~ ${formatPrice(car.dealerPriceMax)}万`;
  } else {
    rangeEl.textContent = '';
  }
  document.getElementById('detailGuidePrice').textContent = `${car.guidePriceMin}~${car.guidePriceMax}万`;
  
  // 涨跌
  const trendEl = document.getElementById('detailTrend');
  trendEl.className = 'price-trend ' + getTrendClass(car.trend);
  if (car.trend === 'up') {
    trendEl.innerHTML = `📈 涨价 ${car.priceChange}万 (+${car.priceChangePercent}%)`;
  } else if (car.trend === 'down') {
    trendEl.innerHTML = `📉 降价 ${Math.abs(car.priceChange)}万 (${car.priceChangePercent}%)`;
  } else if (car.trend === 'stable') {
    trendEl.textContent = '➖ 价格稳定';
  } else {
    trendEl.textContent = '● 首次记录（暂无历史对比）';
  }
  
  // 配置表
  document.getElementById('cfgBrand').textContent = car.brand;
  document.getElementById('cfgName').textContent = car.name;
  document.getElementById('cfgFuel').textContent = car.fuelType;
  document.getElementById('cfgPrice').textContent = `${car.dealerPriceMin}~${car.dealerPriceMax}万`;
  document.getElementById('cfgPopularity').textContent = car.popularity ? `${(car.popularity / 10000).toFixed(1)}万关注` : '-';
  
  // 懂车帝链接
  document.getElementById('detailDCDLink').href = `https://www.dongchedi.com/series/${car.id}`;
  
  // 滚到顶部
  window.scrollTo(0, 0);
}

// 返回列表
function backToList() {
  document.getElementById('detailView').style.display = 'none';
  document.getElementById('listView').style.display = 'block';
  window.scrollTo(0, 0);
}

// ====== 工具函数 ======
function getTypeBadge(type) {
  const map = { '燃油': 'type-gas', '纯电': 'type-ev', '混动': 'type-hybrid' };
  return `<span class="type-badge ${map[type] || ''}">${type}</span>`;
}

function formatPrice(price) {
  if (!price || price <= 0) return '暂无报价';
  return price.toFixed(2) + '万';
}

function getTrendClass(trend) {
  const map = { 'up': 'trend-up', 'down': 'trend-down', 'stable': 'trend-stable', 'first': 'trend-first' };
  return map[trend] || '';
}

function getTrendArrow(trend) {
  const map = {
    'up': '<span class="arrow-up"></span>涨价了',
    'down': '<span class="arrow-down"></span>降价了',
    'stable': '<span class="arrow-stable"></span>价格稳定',
    'first': '<span class="arrow-first"></span>首次记录',
  };
  return map[trend] || '-';
}

function getTrendText(car) {
  if (car.trend === 'first') return '-';
  if (car.trend === 'up') return `+${car.priceChange}万 (+${car.priceChangePercent}%)`;
  if (car.trend === 'down') return `${car.priceChange}万 (${car.priceChangePercent}%)`;
  return '-';
}

function formatTime(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  return `${d.getMonth()+1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n) { return n < 10 ? '0' + n : n; }
