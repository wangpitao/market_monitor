// index.ts
import Message from 'tdesign-miniprogram/message/index';

const app = getApp<IAppOption>()

interface IndexPageData {
  watchlist: WatchlistEntry[];
  quotes: Record<string, StockQuote>;
  loading: boolean;
  inputValue: string;
  hasLogin: boolean; // Add login state
}

interface IndexPageMethods {
  fetchWatchlist(): Promise<void>;
  fetchQuotes(): Promise<void>;
  onAddStock(): Promise<void>;
  onInput(e: any): void;
  onTapStock(e: any): void;
  onDeleteStock(e: any): Promise<void>;
  stopBubble(): void;
  checkLogin(): boolean;
  onGoToLogin(): void;
}

Page<IndexPageData, IndexPageMethods>({
  data: {
    watchlist: [],
    quotes: {},
    loading: false,
    inputValue: '',
    hasLogin: false,
  },

  onLoad() {
    // Initial check
    if (app.globalData.hasLogin) {
      this.setData({ hasLogin: true });
      this.fetchWatchlist();
    } else {
      // Try async check
      app.checkLoginStatus().then(loggedIn => {
        this.setData({ hasLogin: loggedIn });
        if (loggedIn) {
          this.fetchWatchlist();
        }
      });
    }
  },

  onShow() {
    // Re-check on show (e.g., returned from Me page)
    const loggedIn = app.globalData.hasLogin;
    if (loggedIn !== this.data.hasLogin) {
      this.setData({ hasLogin: loggedIn });
      if (loggedIn) {
        this.fetchWatchlist();
      } else {
        this.setData({ watchlist: [] }); // Clear data if logout
      }
    } else if (loggedIn) {
      this.fetchQuotes();
    }
  },

  checkLogin() {
    if (!app.globalData.hasLogin) {
      Message.warning({
        context: this,
        offset: [20, 32],
        content: '请先登录',
      });
      return false;
    }
    return true;
  },
  
  onGoToLogin() {
    wx.switchTab({ url: '/pages/me/me' });
  },

  async fetchWatchlist() {
    if (!this.data.hasLogin) return;
    
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'stock-service',
        data: { action: 'getWatchlist' }
      });
      
      const result = res.result as { data: WatchlistEntry[] };
      if (result && result.data) {
        this.setData({ watchlist: result.data });
        this.fetchQuotes();
      }
    } catch (err) {
      console.error('Failed to fetch watchlist', err);
    } finally {
      this.setData({ loading: false });
    }
  },

  async fetchQuotes() {
    const { watchlist } = this.data;
    if (watchlist.length === 0) return;

    const symbols = watchlist.map(item => item.symbol);
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'stock-service',
        data: { 
          action: 'getQuotes',
          symbols: symbols
        }
      });
      
      const result = res.result as { data: StockQuote[] };
      if (result && result.data) {
        const quotesMap: Record<string, StockQuote> = {};
        result.data.forEach((q: StockQuote) => {
          quotesMap[q.symbol] = q;
        });
        this.setData({ quotes: quotesMap });
      }
    } catch (err) {
      console.error('Failed to fetch quotes', err);
    }
  },

  async onAddStock() {
    if (!this.checkLogin()) return; // Login Guard

    const symbol = this.data.inputValue.toUpperCase().trim();
    if (!symbol) return;

    wx.showLoading({ title: '添加中...' });
    try {
      await wx.cloud.callFunction({
        name: 'stock-service',
        data: {
          action: 'addWatchlist',
          symbol: symbol,
          name: symbol 
        }
      });
      this.setData({ inputValue: '' });
      await this.fetchWatchlist();
      Message.success({
        context: this,
        offset: [20, 32],
        content: '添加成功',
      });
    } catch (err) {
      console.error(err);
      Message.error({
        context: this,
        offset: [20, 32],
        content: '添加失败',
      });
    } finally {
      wx.hideLoading();
    }
  },

  onInput(e: any) {
    this.setData({ inputValue: e.detail.value });
  },

  onTapStock(e: any) {
    const symbol = e.currentTarget.dataset.symbol;
    wx.navigateTo({
      url: `/pages/stock/stock?symbol=${symbol}`
    });
  },

  async onDeleteStock(e: any) {
    const id = e.currentTarget.dataset.id;
    const symbol = e.currentTarget.dataset.symbol;

    const modal = await wx.showModal({
      title: '提示',
      content: `确定移除 ${symbol}?`
    });

    if (modal.confirm) {
      try {
        await wx.cloud.callFunction({
          name: 'stock-service',
          data: { action: 'removeWatchlist', id }
        });
        this.fetchWatchlist();
        Message.success({
          context: this,
          offset: [20, 32],
          content: '已移除',
        });
      } catch (err) {
        Message.error({
          context: this,
          offset: [20, 32],
          content: '删除失败',
        });
      }
    }
  },

  stopBubble() {
  }
})
