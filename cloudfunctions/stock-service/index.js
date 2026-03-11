const cloud = require('wx-server-sdk')
const axios = require('axios')
const iconv = require('iconv-lite')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 智能判断股票市场前缀
// 纯字母 -> 美股 (gb_)
// 5位数字 -> 港股 (hk)
// 6位数字 -> A股 (sh/sz/bj)
const getSinaCode = (symbol) => {
  symbol = symbol.trim();
  if (/^[A-Za-z]+$/.test(symbol)) return `gb_${symbol.toLowerCase()}`;
  if (/^\d{5}$/.test(symbol)) return `hk${symbol}`;
  if (/^\d{6}$/.test(symbol)) {
    // 上交所: 6(主板/科创), 9(B股), 5(ETF/基金), 7(新股)
    if (/^[5679]/.test(symbol)) return `sh${symbol}`;
    // 北交所: 8, 4
    if (/^[48]/.test(symbol)) return `bj${symbol}`;
    // 深交所: 0(主板), 3(创业), 2(B股), 1(基金)
    return `sz${symbol}`;
  }
  return symbol.toLowerCase();
}

// 解析新浪财经返回的字符串
const parseSinaData = (code, rawStr) => {
  if (!rawStr || rawStr.length < 10) return null;
  const content = rawStr.split('"')[1];
  if (!content) return null;
  
  const parts = content.split(',');
  let name = parts[0];
  let price = 0;
  let changePercent = '';

  if (code.startsWith('gb_')) {
    // 美股
    name = parts[0];
    price = parseFloat(parts[1]);
    changePercent = parts[2] + '%';
  } else if (code.startsWith('hk')) {
    // 港股
    name = parts[1]; // 港股中文名在第2位
    price = parseFloat(parts[6]);
    changePercent = parts[8] + '%';
  } else {
    // A股
    name = parts[0];
    price = parseFloat(parts[3]);
    const prevClose = parseFloat(parts[2]);
    if (prevClose > 0) {
      changePercent = (((price - prevClose) / prevClose) * 100).toFixed(2) + '%';
    } else {
      changePercent = '0.00%';
    }
  }

  if (isNaN(price)) return null;

  // 正数添加 + 号
  if (parseFloat(changePercent) > 0 && !changePercent.startsWith('+')) {
    changePercent = '+' + changePercent;
  }

  return {
    name,
    price: price.toFixed(3),
    change: changePercent,
    timestamp: new Date().toISOString()
  };
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database();
  
  switch (event.action) {
    case 'getQuotes': {
      const symbols = event.symbols || [];
      if (symbols.length === 0) return { data: [] };

      // 批量请求
      const sinaCodes = symbols.map(s => getSinaCode(s));
      const url = `http://hq.sinajs.cn/list=${sinaCodes.join(',')}`;
      
      const headers = {
        'Referer': 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };

      try {
        const response = await axios.get(url, { 
          headers,
          responseType: 'arraybuffer', // 关键：获取 buffer 以便解码
          timeout: 3000 
        });
        const decoded = iconv.decode(response.data, 'gbk');
        const lines = decoded.split(';').filter(l => l.trim().length > 0);
        
        const results = [];
        lines.forEach(line => {
          const match = line.match(/hq_str_(\w+)=/);
          if (match) {
            const code = match[1];
            const parsed = parseSinaData(code, line);
            if (parsed) {
              const originalSymbol = symbols.find(s => getSinaCode(s) === code);
              if (originalSymbol) {
                results.push({ symbol: originalSymbol, ...parsed });
              }
            }
          }
        });
        return { data: results };
      } catch (err) {
        console.error(err);
        return { data: [] };
      }
    }

    case 'getKline': {
      // Fetch K-line data (Simple version for A-share)
      const symbol = event.symbol ? getSinaCode(event.symbol) : '';
      if (!symbol) return { data: [] };
      
      const scale = event.scale || 240; // 240 = Daily
      const len = event.datalen || 30;
      
      // Sina K-line API only supports sh/sz prefix well for this specific endpoint
      // For HK/US, we might need other endpoints or mock fallback.
      let url = `http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=${scale}&ma=no&datalen=${len}`;
      
      // Basic fallback for HK/US if sina api fails or differs significantly
      if (symbol.startsWith('hk') || symbol.startsWith('gb_')) {
         // Mock K-line for demo stability on non-A-shares
         const mockData = [];
         let price = 100 + Math.random() * 50;
         for (let i = 0; i < len; i++) {
           price = price * (1 + (Math.random() - 0.5) * 0.05);
           mockData.push({ day: `2024-01-${i+1}`, close: price.toFixed(2) });
         }
         return { data: mockData };
      }

      try {
        const response = await axios.get(url, { 
          headers: { 'Referer': 'https://finance.sina.com.cn' },
          timeout: 3000 
        });
        // Response is JSON array: [{day:"2023-...", open:"...", high:"...", low:"...", close:"...", volume:"..."}]
        // Sina returns valid JSON usually.
        let data = response.data;
        if (typeof data === 'string') {
           // sometimes it might be wrapped or malformed? usually clean json.
           // try parsing if string
           try { data = JSON.parse(data); } catch(e) {}
        }
        
        if (Array.isArray(data)) {
          return { data };
        } else {
          return { data: [] };
        }
      } catch (e) {
        console.error(e);
        return { data: [] };
      }
    }

    case 'getHotSectors': {
      try {
        const url = 'http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=6&sort=changepercent&asc=0&node=new_blhy&symbol=&_s_r_a=init';
        const response = await axios.get(url, {
          headers: { 'Referer': 'https://finance.sina.com.cn' },
          responseType: 'arraybuffer', // 必须获取 buffer
          timeout: 3000
        });
        
        const decoded = iconv.decode(response.data, 'gbk');
        
        let data = [];
        try {
           // Safe parsing for array of objects
           // The response is usually valid JS object array: [{symbol:"...",...}]
           // Use Function to parse it.
           data = new Function('return ' + decoded)();
        } catch(e) {
           console.error('Parse Sina Sectors failed', e);
        }

        const sectors = Array.isArray(data) ? data.map(item => ({
          symbol: item.symbol, // Return symbol
          name: item.name,
          change: (item.changepercent > 0 ? '+' : '') + item.changepercent.toFixed(2) + '%',
          isUp: item.changepercent > 0,
          value: item.trade
        })) : [];

        return { data: sectors };
      } catch (e) {
        console.error(e);
        return { data: [] };
      }
    }

    case 'searchStock': {
      try {
        const key = encodeURIComponent(event.key);
        const url = `http://suggest3.sinajs.cn/suggest/type=&key=${key}`;
        
        const response = await axios.get(url, {
          headers: { 'Referer': 'https://finance.sina.com.cn' },
          responseType: 'arraybuffer',
          timeout: 3000
        });
        
        const decoded = iconv.decode(response.data, 'gbk');
        // format: var suggestdata="symbol,type,code,name,pinyin,...;..."
        const match = decoded.match(/"(.*)"/);
        if (!match) return { data: [] };
        
        const rawItems = match[1].split(';');
        const results = [];
        
        rawItems.forEach(item => {
          const parts = item.split(',');
          if (parts.length > 4) {
            // parts[3] is name, parts[0] is symbol (sh600519), parts[2] is code (600519)
            // Filter out non-stocks if needed, but suggestion usually returns valid stuff
            // We mainly want A-share, HK, US
            const symbol = parts[0]; // e.g. sh600519 or hk00700
            const name = parts[3];   // parts[3] is name (parts[4] is pinyin)
            
            // Basic filtering to ensure it's a stock-like symbol
            if (symbol && name) {
               results.push({ symbol, name });
            }
          }
        });
        
        // Return top 5
        return { data: results.slice(0, 5) };
      } catch (e) {
        console.error(e);
        return { data: [] };
      }
    }

    case 'addWatchlist': {
      const symbol = event.symbol.toUpperCase();
      const sinaCode = getSinaCode(symbol);
      const url = `http://hq.sinajs.cn/list=${sinaCode}`;
      
      const headers = {
        'Referer': 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };

      try {
        // 1. 调用接口验证股票是否存在，并获取名称
        const response = await axios.get(url, { 
          headers,
          responseType: 'arraybuffer', 
          timeout: 3000 
        });
        const decoded = iconv.decode(response.data, 'gbk');
        
        // 空数据判断
        if (decoded.includes('=""')) return { success: false, error: '股票代码无效' };

        const parsed = parseSinaData(sinaCode, decoded);
        if (!parsed) {
           console.error('Parse failed for', sinaCode, decoded);
           return { success: false, error: '数据解析失败' };
        }

        // 2. 查重
        const check = await db.collection('watchlist').where({
          _openid: wxContext.OPENID,
          symbol: symbol
        }).get();

        if (check.data.length > 0) return { success: false, error: '已存在' };

        // 3. 入库
        await db.collection('watchlist').add({
          data: {
            _openid: wxContext.OPENID,
            symbol: symbol,
            name: parsed.name, // 使用接口返回的真实名称
            addedAt: db.serverDate()
          }
        });
        
        return { success: true, name: parsed.name };
      } catch (e) {
        console.error(e);
        // Return detailed error for debugging
        return { success: false, error: e.message || '网络错误' };
      }
    }

    case 'getWatchlist':
      try {
        const res = await db.collection('watchlist').where({ _openid: wxContext.OPENID }).get();
        return { data: res.data };
      } catch (e) {
        return { success: false, error: e };
      }

    case 'removeWatchlist':
      try {
        await db.collection('watchlist').doc(event.id).remove();
        return { success: true };
      } catch (e) {
         return { success: false, error: e };
      }

    case 'updatePosition': {
      try {
        const { symbol, cost, amount, aiAnalysis } = event;
        // Find the watchlist item for this symbol
        const res = await db.collection('watchlist').where({
          _openid: wxContext.OPENID,
          symbol: symbol
        }).get();

        if (res.data.length > 0) {
          const updateData = {
            position: {
              cost: parseFloat(cost),
              amount: parseFloat(amount)
            }
          };
          
          if (aiAnalysis) {
            updateData.aiAnalysis = aiAnalysis;
          }

          await db.collection('watchlist').doc(res.data[0]._id).update({
            data: updateData
          });
          return { success: true };
        }
        return { success: false, error: 'Not found' };
      } catch (e) {
        console.error(e);
        return { success: false, error: e };
      }
    }

    case 'getStockDetail': {
      try {
        let symbol = event.symbol;
        // Try exact match first
        let res = await db.collection('watchlist').where({
          _openid: wxContext.OPENID,
          symbol: symbol
        }).get();

        if (res.data.length === 0) {
           // Try normalized symbol (upper case, sina code format)
           // e.g. 600519 -> sh600519 -> SH600519? 
           // Our addWatchlist saves as passed symbol.toUpperCase().
           // If user adds 'sh600519', db has 'SH600519'.
           // If passed '600519', try 'SH600519' etc.
           
           // Strategy: Try standard sina code variations
           const sinaCode = getSinaCode(symbol); // sh600519
           const upper = sinaCode.toUpperCase(); // SH600519
           
           res = await db.collection('watchlist').where({
             _openid: wxContext.OPENID,
             symbol: db.command.in([symbol, symbol.toUpperCase(), sinaCode, upper])
           }).get();
        }

        if (res.data.length > 0) {
          return { success: true, data: res.data[0] };
        }
        return { success: false, error: 'Not found' };
      } catch (e) {
        return { success: false, error: e };
      }
    }

    case 'sendSubscriptionMessage': {
      try {
        const { templateId, data, page } = event;
        const result = await cloud.openapi.subscribeMessage.send({
          touser: wxContext.OPENID,
          templateId: templateId,
          page: page,
          data: data,
          miniprogramState: 'developer' // developer, trial, formal
        });
        return { success: true, result };
      } catch (err) {
        console.error(err);
        return { success: false, error: err };
      }
    }

    case 'getIndices': {
      // Real Indices Data
      // s_sh000001: 上证指数
      // s_sz399001: 深证成指
      // s_sz399006: 创业板指
      // rt_hkHSI: 恒生指数
      // gb_ixic: 纳斯达克
      const url = 'http://hq.sinajs.cn/list=s_sh000001,s_sz399001,s_sz399006,rt_hkHSI,gb_ixic,gb_dji';
      
      const headers = {
        'Referer': 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0'
      };

      try {
        const response = await axios.get(url, { headers, responseType: 'arraybuffer', timeout: 3000 });
        const decoded = iconv.decode(response.data, 'gbk');
        const lines = decoded.split(';').filter(l => l.trim().length > 0);
        
        const indices = [];
        
        lines.forEach(line => {
          const match = line.match(/hq_str_(\w+)=/);
          if (!match) return;
          const code = match[1];
          const content = line.split('"')[1];
          if (!content) return;
          const parts = content.split(',');

          let name = '';
          let value = 0;
          let change = '';
          let changeRate = '';

          // A股指数格式: name, current, change, rate(%), vol, amount
          if (code.startsWith('s_')) {
            name = parts[0];
            value = parseFloat(parts[1]);
            change = parseFloat(parts[2]);
            changeRate = parseFloat(parts[3]); // pure number like -1.25
          } 
          // 港股/美股格式差异大，需单独处理
          else if (code === 'rt_hkHSI') {
            name = '恒生指数'; // parts[0] is en name
            value = parseFloat(parts[6]);
            const prevClose = parseFloat(parts[3]);
            change = value - prevClose;
            changeRate = (change / prevClose) * 100;
          }
          else if (code.startsWith('gb_')) {
            name = parts[0];
            value = parseFloat(parts[1]);
            changeRate = parseFloat(parts[2]); // pure number
            change = value * (changeRate / 100); // approx
          }

          if (name) {
             const rateStr = (changeRate >= 0 ? '+' : '') + changeRate.toFixed(2) + '%';
             indices.push({
               name,
               value: value.toFixed(3), // 保留3位小数
               change: (change >= 0 ? '+' : '') + change.toFixed(2),
               rate: rateStr,
               isUp: changeRate >= 0
             });
          }
        });

        return { data: indices };
      } catch (e) {
        console.error(e);
        return { data: [] };
      }
    }

    default:
      return { error: 'Unknown action' }
  }
}
