// pages/market/market.ts
const app = getApp<IAppOption>()

interface MarketIndex {
  name: string;
  value: number;
  change: string;
  isUp: boolean;
}

Page({
  data: {
    indices: [] as MarketIndex[],
    loading: false
  },

  onShow() {
    this.fetchIndices();
  },

  async fetchIndices() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'stock-service',
        data: { action: 'getIndices' }
      });
      const result = res.result as { data: MarketIndex[] };
      if (result && result.data) {
        this.setData({ indices: result.data });
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.setData({ loading: false });
    }
  }
})
