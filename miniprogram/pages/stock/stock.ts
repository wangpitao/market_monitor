// pages/stock/stock.ts
const app = getApp<IAppOption>()

Page({
  data: {
    symbol: '',
    quote: {} as any,
    kline: [] as any[],
    aiResult: null as any,
    loadingAnalysis: false,
    positionCost: '',
    positionAmount: '',
  },

  onLoad(options: any) {
    if (options.symbol) {
      this.setData({ symbol: options.symbol });
      this.fetchQuote(options.symbol);
      this.fetchKline(options.symbol);
      this.fetchStockDetail(options.symbol);
    }
  },

  async fetchStockDetail(symbol: string) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'stock-service',
        data: {
          action: 'getStockDetail',
          symbol: symbol
        }
      });
      const result = res.result as any;
      if (result.success && result.data && result.data.position) {
        this.setData({
          positionCost: result.data.position.cost || '',
          positionAmount: result.data.position.amount || ''
        });
      }
    } catch (e) {
      console.error('Fetch detail failed', e);
    }
  },

  async updatePosition() {
    try {
      await wx.cloud.callFunction({
        name: 'stock-service',
        data: {
          action: 'updatePosition',
          symbol: this.data.symbol,
          cost: this.data.positionCost,
          amount: this.data.positionAmount
        }
      });
    } catch (e) {
      console.error('Update position failed', e);
    }
  },

  async fetchQuote(symbol: string) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'stock-service',
        data: { 
          action: 'getQuotes',
          symbols: [symbol]
        }
      });
      const result = res.result as any;
      if (result && result.data && result.data.length > 0) {
        this.setData({ quote: result.data[0] });
      }
    } catch (e) {
      console.error(e);
    }
  },

  async fetchKline(symbol: string) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'stock-service',
        data: {
          action: 'getKline',
          symbol: symbol,
          scale: 240,
          datalen: 30
        }
      });
      
      const data = (res.result as any).data || [];
      this.setData({ kline: data });
      
      if (data.length > 0) {
        this.drawTrendChart(data);
      }
    } catch (e) {
      console.error('Fetch Kline Failed', e);
    }
  },

  drawTrendChart(data: any[]) {
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

  onCostChange(e: any) {
    this.setData({ positionCost: e.detail.value });
  },

  onAmountChange(e: any) {
    this.setData({ positionAmount: e.detail.value });
  },

  async getAIAnalysis() {
    if (this.data.loadingAnalysis) return;
    
    if (!this.data.positionCost || !this.data.positionAmount) {
      wx.showToast({ title: '请输入持仓', icon: 'none' });
      return;
    }
    
    this.setData({ loadingAnalysis: true });

    // 1. Save Position First
    await this.updatePosition();

    try {
      const { symbol, quote, kline, positionCost, positionAmount } = this.data;
      const closePrices = kline.map(k => k.close).slice(-10);
      const pnl = ((quote.price - positionCost) / positionCost * 100).toFixed(2) + '%';
      
      const prompt = `你是一名专业量化交易分析助手。
【标的】${symbol} (${quote.name || ''})
【实时行情】现价:${quote.price}, 涨跌:${quote.change}
【历史收盘价(近10日)】${closePrices.join(', ')}
【用户持仓】成本:${positionCost}, 数量:${positionAmount}, 浮动盈亏:${pnl}
【任务】请基于技术形态和持仓情况，给出操作建议。
请严格仅返回 JSON 格式，不要包含 Markdown 标记，格式如下：
{
  "trend": "看涨/看跌/震荡",
  "action": "buy/sell/hold",
  "risk_level": "low/medium/high",
  "reason": "简短理由(50字内)",
  "stop_loss": "建议止损价",
  "take_profit": "建议止盈价"
}`;

      console.log('Sending Prompt to AI:', prompt);

      // @ts-ignore
      const model = wx.cloud.extend.AI.createModel("hunyuan-exp");
      const res = await model.streamText({
        data: {
          model: "hunyuan-turbos-latest",
          messages: [{ role: "user", content: prompt }]
        }
      });

      console.log('AI Stream started...');
      let fullText = '';
      
      for await (let event of res.eventStream) {
        if (event.data === "[DONE]") break;
        try {
          const data = JSON.parse(event.data);
          const text = data?.choices?.[0]?.delta?.content;
          if (text) {
             fullText += text;
             console.log('AI Chunk:', text);
          }
        } catch (e) { /* ignore */ }
      }

      console.log('AI Raw Output (Final):', fullText);

      const jsonStr = fullText.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(jsonStr);

      this.setData({ aiResult: result });

      if (result.action === 'buy' || result.action === 'sell') {
        this.triggerSubscriptionMessage(result);
      }

    } catch (e) {
      console.error('AI Analysis Failed:', e);
      wx.showToast({ title: 'AI 服务繁忙', icon: 'none' });
    } finally {
      this.setData({ loadingAnalysis: false });
    }
  },

  async triggerSubscriptionMessage(aiResult: any) {
    const TEMPLATE_ID = 'UZStRUO7Pyi5Nk6nsKZ1SQkFG3vZ5qqr0t04i05CYJQ';
    const { symbol, quote } = this.data;
    const now = new Date();
    const timeString = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;

    const msgData: any = {
      thing1: { value: aiResult.action.toUpperCase() },
      thing2: { value: `${quote.name || symbol} (${symbol})`.substring(0, 20) },
      thing3: { value: aiResult.reason.substring(0, 20) },
    };
    
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
