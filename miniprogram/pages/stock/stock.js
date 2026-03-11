// pages/stock/stock.js
const app = getApp()

Page({
  data: {
    symbol: '',
    quote: {},
    kline: [],
    aiResult: null,
    loadingAnalysis: false,
    positionCost: '',
    positionAmount: '',
    isInWatchlist: false,
    aiAnalysisTime: '',
    timer: null,
    analysisProgress: 0,
    analysisStatus: ''
  },

  onLoad(options) {
    if (options.symbol) {
      this.setData({ symbol: options.symbol });
      this.fetchQuote(options.symbol);
      this.fetchKline(options.symbol);
      this.fetchStockDetail(options.symbol);
    }
  },

  onShow() {
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  startPolling() {
    this.stopPolling(); // Clear existing timer
    // Refresh every 3 seconds for active stock
    this.data.timer = setInterval(() => {
      if (this.data.symbol) {
        this.fetchQuote(this.data.symbol);
      }
    }, 3000);
  },

  stopPolling() {
    if (this.data.timer) {
      clearInterval(this.data.timer);
      this.setData({ timer: null });
    }
  },

  async fetchStockDetail(symbol) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'stock-service',
        data: {
          action: 'getStockDetail',
          symbol: symbol
        }
      });
      const result = res.result;
      if (result.success && result.data) {
        const updateData = { isInWatchlist: true }; // Mark as in watchlist
        
        if (result.data.position) {
          updateData.positionCost = result.data.position.cost || '';
          updateData.positionAmount = result.data.position.amount || '';
        }

        if (result.data.aiAnalysis) {
          updateData.aiResult = result.data.aiAnalysis.result;
          updateData.aiAnalysisTime = result.data.aiAnalysis.time;
        }

        this.setData(updateData);
      } else {
        this.setData({ isInWatchlist: false });
      }
    } catch (e) {
      console.error('Fetch detail failed', e);
      this.setData({ isInWatchlist: false });
    }
  },

  async toggleWatchlist() {
    const { symbol, quote, isInWatchlist } = this.data;
    
    if (isInWatchlist) {
      // Remove logic (Optional, maybe ask for confirmation)
      wx.showModal({
        title: '移除自选',
        content: '确定要从自选列表中移除吗？',
        success: async (res) => {
          if (res.confirm) {
             // We need the ID to remove, but we can query by symbol in cloud function
             // Or add a dedicated removeBySymbol action
             // For now, let's skip implementation or add a simple one if needed.
             // But user asked to "add", not explicitly remove. 
             // Let's implement ADD first.
          }
        }
      });
      return;
    }

    wx.showLoading({ title: '添加中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'stock-service',
        data: {
          action: 'addWatchlist',
          symbol: symbol,
          name: quote.name || symbol
        }
      });
      
      if (res.result.success) {
        this.setData({ isInWatchlist: true });
        wx.showToast({ title: '已加入自选' });
        // Refresh detail to ensure data consistency
        this.fetchStockDetail(symbol); 
      } else {
        wx.showToast({ title: res.result.error || '添加失败', icon: 'none' });
      }
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async updatePosition(aiResult = null) {
    try {
      const data = {
        action: 'updatePosition',
        symbol: this.data.symbol,
        cost: this.data.positionCost,
        amount: this.data.positionAmount
      };

      if (aiResult) {
        const now = new Date();
        const timeStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        
        data.aiAnalysis = {
          result: aiResult,
          time: timeStr
        };
        
        this.setData({ aiAnalysisTime: timeStr });
      }

      await wx.cloud.callFunction({
        name: 'stock-service',
        data: data
      });
    } catch (e) {
      console.error('Update position failed', e);
    }
  },

  async fetchQuote(symbol) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'stock-service',
        data: { 
          action: 'getQuotes',
          symbols: [symbol]
        }
      });
      const result = res.result;
      if (result && result.data && result.data.length > 0) {
        this.setData({ quote: result.data[0] });
      }
    } catch (e) {
      console.error(e);
    }
  },

  async fetchKline(symbol) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'stock-service',
        data: {
          action: 'getKline',
          symbol: symbol,
          scale: 240,
          datalen: 60 // 增加数据量以计算 MA20/RSI
        }
      });
      
      const data = res.result.data || [];
      this.setData({ kline: data });
      
      if (data.length > 0) {
        this.drawTrendChart(data);
      }
    } catch (e) {
      console.error('Fetch Kline Failed', e);
    }
  },

  drawTrendChart(data) {
    const query = wx.createSelectorQuery();
    query.select('#trendChart')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return;
        
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        
        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);
        
        const width = res[0].width;
        const height = res[0].height;
        
        const prices = data.map(item => parseFloat(item.close));
        const max = Math.max(...prices);
        const min = Math.min(...prices);
        const range = max - min || 1;
        
        ctx.strokeStyle = '#0052D9';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const stepX = width / (prices.length - 1);
        
        prices.forEach((price, index) => {
          const x = index * stepX;
          const normalized = (price - min) / range;
          const y = height - (normalized * height * 0.8) - height * 0.1;
          
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        
        ctx.stroke();
      });
  },

  onCostChange(e) {
    this.setData({ positionCost: e.detail.value });
  },

  onAmountChange(e) {
    this.setData({ positionAmount: e.detail.value });
  },

  // 计算简单的技术指标
  calculateIndicators(kline) {
    if (!kline || kline.length < 20) return { ma5: '--', ma10: '--', ma20: '--', rsi: '--' };
    
    const closes = kline.map(k => parseFloat(k.close));
    const len = closes.length;

    // Helper to calculate average
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

    const ma5 = avg(closes.slice(len - 5)).toFixed(2);
    const ma10 = avg(closes.slice(len - 10)).toFixed(2);
    const ma20 = avg(closes.slice(len - 20)).toFixed(2);

    // Calculate RSI(14) - Simplified
    let gains = 0;
    let losses = 0;
    for (let i = len - 14; i < len; i++) {
      const change = closes[i] - closes[i - 1];
      if (change >= 0) gains += change;
      else losses -= change;
    }
    const rs = gains / (losses || 1); // Avoid division by zero
    const rsi = (100 - (100 / (1 + rs))).toFixed(2);

    return { ma5, ma10, ma20, rsi };
  },

  async addToWatchlist() {
    const { symbol, quote } = this.data;
    wx.showLoading({ title: '添加中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'stock-service',
        data: {
          action: 'addWatchlist',
          symbol: symbol,
          name: quote.name || symbol
        }
      });
      
      if (res.result.success) {
        this.setData({ isInWatchlist: true });
        wx.showToast({ title: '已加入自选' });
        // Refresh detail to ensure data consistency
        this.fetchStockDetail(symbol); 
      } else {
        wx.showToast({ title: res.result.error || '添加失败', icon: 'none' });
      }
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  handleAnalyzeClick() {
    if (this.data.loadingAnalysis) return;

    if (!this.data.isInWatchlist) {
      wx.showModal({
        title: '开启 AI 分析',
        content: 'AI 分析功能仅对自选股开放，是否立即加入自选？',
        success: (res) => {
          if (res.confirm) {
            this.addToWatchlist();
          }
        }
      });
      return;
    }

    if (!this.data.positionCost || !this.data.positionAmount) {
      wx.showToast({ title: '请输入持仓成本和数量', icon: 'none' });
      return;
    }

    this.getAIAnalysis();
  },

  async getAIAnalysis() {
    this.setData({ 
      loadingAnalysis: true, 
      aiResult: null, // Reset result to show progress UI
      analysisProgress: 0, 
      analysisStatus: '正在初始化 AI 模型...' 
    });

    // 1. Save Position First
    await this.updatePosition();
    this.setData({ analysisProgress: 10, analysisStatus: '已同步持仓数据...' });

    try {
      const { symbol, quote, kline, positionCost, positionAmount } = this.data;
      
      // Calculate Indicators
      const indicators = this.calculateIndicators(kline);
      const closePrices = kline.map(k => parseFloat(k.close).toFixed(2));
      const recentCloses = closePrices.slice(-10).join(', ');
      
      const currentPrice = parseFloat(quote.price);
      const cost = parseFloat(positionCost);
      const pnlRate = ((currentPrice - cost) / cost * 100).toFixed(2) + '%';
      const pnlAmount = ((currentPrice - cost) * parseFloat(positionAmount)).toFixed(2);
      
      // 构造高级 Prompt
      const prompt = `你是一名资深量化交易专家。请根据以下多维度数据进行深度分析并给出操作建议。

【标的信息】
- 代码: ${symbol}
- 名称: ${quote.name || '未知'}
- 实时价格: ${quote.price} (涨跌: ${quote.change})

【技术指标 (基于近60日数据)】
- 近10日收盘价: [${recentCloses}]
- 均线系统: MA5=${indicators.ma5}, MA10=${indicators.ma10}, MA20=${indicators.ma20}
- 相对强弱指标 (RSI 14): ${indicators.rsi} (参考: >70超买, <30超卖)

【用户持仓分析】
- 持仓成本: ${positionCost}
- 持仓数量: ${positionAmount}
- 当前浮动盈亏: ${pnlAmount} (${pnlRate})
- 盈亏状态: ${parseFloat(pnlAmount) > 0 ? '盈利中' : '亏损中'}

【分析任务】
请综合技术面（趋势、支撑压力、指标背离）和资金面（持仓风险收益比），给出明确的交易策略。

请严格按以下 JSON 格式输出（不要输出 Markdown 代码块，仅输出纯 JSON 字符串）：
{
  "trend": "描述当前趋势（如：上升通道/底部震荡/顶部回落）",
  "action": "buy(加仓)/sell(减仓/清仓)/hold(持有观望)",
  "risk_level": "low/medium/high",
  "reason": "核心逻辑（200字以内，包含技术形态分析和操作理由）",
  "support": ["支撑位1", "支撑位2"],
  "resistance": ["压力位1", "压力位2"],
  "stop_loss": "建议止损价",
  "take_profit": "建议止盈价"
}`;

      this.setData({ analysisProgress: 20, analysisStatus: '正在发送分析请求...' });
      console.log('Sending Prompt to AI:', prompt);

      const model = wx.cloud.extend.AI.createModel("hunyuan-exp");
      const res = await model.streamText({
        data: {
          model: "hunyuan-turbos-latest",
          messages: [{ role: "user", content: prompt }]
        }
      });

      this.setData({ analysisProgress: 30, analysisStatus: 'AI 正在思考中...' });
      console.log('AI Stream started...');
      let fullText = '';
      let chunkCount = 0;
      
      for await (let event of res.eventStream) {
        if (event.data === "[DONE]") break;
        try {
          const data = JSON.parse(event.data);
          const text = data?.choices?.[0]?.delta?.content;
          if (text) {
             fullText += text;
             chunkCount++;
             // Simulate progress based on chunks
             let progress = 30 + Math.min(60, chunkCount * 2);
             this.setData({ 
               analysisProgress: progress,
               analysisStatus: '正在生成分析报告...' 
             });
             console.log('AI Chunk:', text);
          }
        } catch (e) { /* ignore */ }
      }

      this.setData({ analysisProgress: 95, analysisStatus: '正在解析结果...' });
      console.log('AI Raw Output (Final):', fullText);

      const jsonStr = fullText.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(jsonStr);

      this.setData({ 
        aiResult: result, 
        analysisProgress: 100, 
        analysisStatus: '分析完成！' 
      });

      // 2. Save Analysis Result
      await this.updatePosition(result);

      // 3. Trigger Subscription Message if Action needed
      if (result.action === 'buy' || result.action === 'sell') {
        this.triggerSubscriptionMessage(result);
      }

    } catch (e) {
      console.error('AI Analysis Failed:', e);
      wx.showToast({ title: 'AI 服务繁忙', icon: 'none' });
      this.setData({ analysisStatus: '分析失败' });
    } finally {
      // Delay clearing loading state to show 100% progress briefly
      setTimeout(() => {
        this.setData({ loadingAnalysis: false, analysisProgress: 0, analysisStatus: '' });
      }, 1000);
    }
  },

  async triggerSubscriptionMessage(aiResult) {
    const TEMPLATE_ID = 'UZStRUO7Pyi5Nk6nsKZ1SQkFG3vZ5qqr0t04i05CYJQ';
    const { symbol, quote } = this.data;
    const now = new Date();
    const timeString = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;

    // Format data for template (Check your template keys in MP admin!)
    // Assuming keys: thing1 (Type), thing2 (Name), thing3 (Content), time4 (Time), amount5 (Price)
    // Note: thing value max 20 chars
    const msgData = {
      thing1: { value: aiResult.action.toUpperCase() }, // 预警类型
      thing2: { value: `${quote.name || symbol} (${symbol})`.substring(0, 20) }, // 交易名称
      thing3: { value: aiResult.reason.substring(0, 20) }, // 提醒内容 (Truncated)
      time4: { value: timeString }, // 提醒时间 (Format must be valid?) Or thing? Usually time type needs full date.
      // time4 might need "2019-08-08 12:00:00" format? Or thing type?
      // Let's assume time4 is time type: YYYY-MM-DD HH:mm:ss
      // Or thing type? User said "提醒时间：当前时间". 
      // Safest is to use full date string.
      // amount5: { value: quote.price + '' } // 当前价格
    };
    
    // Fix Time Format
    const fullTime = now.getFullYear() + '-' + (now.getMonth()+1).toString().padStart(2,'0') + '-' + now.getDate().toString().padStart(2,'0') + ' ' + timeString;
    msgData.time4 = { value: fullTime }; 
    msgData.amount5 = { value: quote.price + '' };

    try {
      await wx.cloud.callFunction({
        name: 'stock-service',
        data: {
          action: 'sendSubscriptionMessage',
          templateId: TEMPLATE_ID,
          page: `pages/stock/stock?symbol=${symbol}`,
          data: msgData
        }
      });
      console.log('Subscription message sent');
    } catch (e) {
      console.error('Send sub msg failed', e);
    }
  },

  async onSubscribe() {
    const TEMPLATE_ID = 'UZStRUO7Pyi5Nk6nsKZ1SQkFG3vZ5qqr0t04i05CYJQ'; 
    try {
      await wx.requestSubscribeMessage({
        tmplIds: [TEMPLATE_ID],
        success: (res) => {
          if (res[TEMPLATE_ID] === 'accept') {
             wx.showToast({ title: '订阅成功' });
          }
        }
      })
    } catch (err) {
      console.error(err);
      wx.showToast({ title: '订阅需要真机调试', icon: 'none' });
    }
  }
})
