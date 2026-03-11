// app.js
App({
  globalData: {
    hasLogin: false,
    userInfo: undefined,
    env: "cloud1-0gfi50rxec17356d" // Replace with actual Env ID
  },
  
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      })
    }
    
    // Auto check login status on launch
    this.checkLoginStatus();
  },

  async checkLoginStatus() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'user-center',
        data: { action: 'login' }
      });
      
      const result = res.result;
      
      if (result.success && result.isRegistered) {
        this.globalData.hasLogin = true;
        this.globalData.userInfo = result.userInfo;
        return true;
      }
      return false;
    } catch (e) {
      console.error('Login check failed', e);
      return false;
    }
  }
})
