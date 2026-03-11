// index.js
const app = getApp()

Page({
  data: {
    watchlist: [],
    quotes: {},
    loading: false,
    inputValue: '',
    hasLogin: false,
    isAdding: false, // 添加锁
  },

  timer: null,

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
    const loggedIn = app.globalData.hasLogin;
    
    // Always update login status from globalData
    this.setData({ hasLogin: loggedIn });

    if (loggedIn) {
      // Always fetch watchlist to ensure new additions are shown
      this.fetchWatchlist();
    } else {
      this.setData({ watchlist: [] });
    }
    
    // Auto polling
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  onPullDownRefresh() {
    if (this.data.hasLogin) {
      this.fetchWatchlist().then(() => {
        wx.stopPullDownRefresh();
      });
    } else {
      wx.stopPullDownRefresh();
    }
  },

  startPolling() {
    this.stopPolling();
    if (this.data.hasLogin) {
      this.timer = setInterval(() => {
        this.fetchQuotes();
      }, 5000);
    }
  },

  stopPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  checkLogin() {
    if (!app.globalData.hasLogin) {
      this.showMessage('warning', '请先登录');
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
      
      const result = res.result;
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
      
      const result = res.result;
      if (result && result.data) {
        const quotesMap = {};
        result.data.forEach((q) => {
          quotesMap[q.symbol] = q;
        });
        this.setData({ quotes: quotesMap });
      }
    } catch (err) {
      console.error('Failed to fetch quotes', err);
    }
  },

  async onAddStock() {
    if (this.data.isAdding) return; // 防止重复点击
    if (!this.checkLogin()) return;

    const symbol = this.data.inputValue.toUpperCase().trim();
    if (!symbol) {
      this.showMessage('warning', '请输入股票代码');
      return;
    }

    // Client-side duplicate check
    const exists = this.data.watchlist.some(item => item.symbol === symbol);
    if (exists) {
      this.showMessage('warning', '该股票已在自选列表中');
      return;
    }

    this.setData({ isAdding: true });
    wx.showLoading({ title: '添加中...', mask: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'stock-service',
        data: {
          action: 'addWatchlist',
          symbol: symbol,
          name: symbol 
        }
      });
      
      if (res.result.success) {
        this.setData({ inputValue: '' });
        await this.fetchWatchlist();
        this.showMessage('success', '添加成功');
      } else {
        throw new Error(res.result.error || 'Unknown error');
      }
    } catch (err) {
      console.error(err);
      // @ts-ignore
      const errMsg = err.message || '添加失败';
      if (errMsg.includes('已存在')) {
         this.showMessage('warning', '该股票已存在');
      } else if (errMsg.includes('无效')) {
         this.showMessage('error', '股票代码无效');
      } else {
         this.showMessage('error', '添加失败，请重试');
      }
    } finally {
      wx.hideLoading();
      this.setData({ isAdding: false });
    }
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  onTapStock(e) {
    const symbol = e.currentTarget.dataset.symbol;
    wx.navigateTo({
      url: `/pages/stock/stock?symbol=${symbol}`
    });
  },

  async onDeleteStock(e) {
    const id = e.currentTarget.dataset.id;
    const symbol = e.currentTarget.dataset.symbol;

    const modal = await wx.showModal({
      title: '提示',
      content: `确定移除 ${symbol}?`,
      confirmColor: '#E34D59'
    });

    if (modal.confirm) {
      wx.showLoading({ title: '移除中', mask: true });
      try {
        await wx.cloud.callFunction({
          name: 'stock-service',
          data: { action: 'removeWatchlist', id }
        });
        this.fetchWatchlist();
        this.showMessage('success', '已移除');
      } catch (err) {
        this.showMessage('error', '删除失败');
      } finally {
        wx.hideLoading();
      }
    }
  },

  stopBubble() {
  },

  showMessage(type, content) {
    let icon = 'none';
    if (type === 'success') icon = 'success';
    else if (type === 'error') icon = 'error';
    
    wx.showToast({
      title: content,
      icon: icon,
      duration: 2000
    });
  }
})
