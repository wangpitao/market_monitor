// pages/market/market.js
const app = getApp()

Page({
  data: {
    indices: [],
    hotSectors: [],
    loading: false,
    timer: null
  },

  onShow() {
    this.refresh();
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  startPolling() {
    this.stopPolling();
    // Refresh indices every 30s
    this.data.timer = setInterval(() => {
      this.refresh();
    }, 30000);
  },

  stopPolling() {
    if (this.data.timer) {
      clearInterval(this.data.timer);
      this.setData({ timer: null });
    }
  },

  async refresh() {
    await Promise.all([this.fetchIndices(), this.fetchHotSectors()]);
  },

  onPullDownRefresh() {
    this.refresh().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  async fetchIndices() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'stock-service',
        data: { action: 'getIndices' }
      });
      const result = res.result;
      if (result && result.data) {
        this.setData({ indices: result.data });
      }
    } catch (e) {
      console.error(e);
    }
  },

  async fetchHotSectors() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'stock-service',
        data: { action: 'getHotSectors' }
      });
      
      if (res.result && res.result.data) {
        this.setData({ hotSectors: res.result.data });
      }
    } catch (e) {
      console.error('Fetch hot sectors failed', e);
    }
  },

  onTapSector(e) {
    const symbol = e.currentTarget.dataset.symbol;
    if (symbol) {
      wx.navigateTo({
        url: `/pages/stock/stock?symbol=${symbol}`
      });
    }
  }
})
