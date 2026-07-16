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
  body.innerHTML = '<tr><td colspan="7" class="loading">⏳ 正在爬取最新价格数据...</td></tr>';
  
  try {
    const res = await fetch('/api/prices');
    const json = await res.json();
    
    if (!json.success) throw new Error(json.error);
    
    allData = json.data;
    document.getElementById('updateTime').textContent = `📅 更新于 ${formatTime(allData.updatedAt)}`;
    
    render();
  } catch (e) {
    body.innerHTML = `<tr><td colspan="7" class="loading">❌ 加载失败: ${e.message}</td></tr>`;
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
  
  // 更新标签状态
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const typeMap = { all: 'all', gas: 'gas', ev: 'ev', hybrid: 'hybrid' };
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
  
  // 搜索过滤
  if (currentFilter) {
    cars = cars.filter(c => 
      c.name.toLowerCase().includes(currentFilter) ||
      c.brand.toLowerCase().includes(currentFilter)
    );
  }
  
  return cars;
}

// 渲染
function render() {
  const cars = getCars();
  const body = document.getElementById('tableBody');
  const summary = document.getElementById('summary');
  
  if (cars.length === 0) {
    body.innerHTML = '<tr><td colspan="7" class="no-result">没有找到匹配的车型</td></tr>';
    summary.innerHTML = `<div class="stat">共 0 辆车</div>`;
    return;
  }
  
  // 统计
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
  
  // 渲染表格
  body.innerHTML = cars.map((car, i) => {
    return `<tr>
      <td class="col-rank">${car.rank}</td>
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

function getTypeBadge(type) {
  const map = { '燃油': 'type-gas', '纯电': 'type-ev', '混动': 'type-hybrid' };
  return `<span class="type-badge ${map[type] || ''}">${type}</span>`;
}

function formatPrice(price) {
  if (!price || price <= 0) return '暂无报价';
  return price.toFixed(2);
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
