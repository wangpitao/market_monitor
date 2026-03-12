// app.ts
interface IAppOption {
  globalData: {
    userInfo?: UserInfo;
    hasLogin: boolean;
    env: string;
  }
  checkLoginStatus: () => Promise<boolean>;
}

// Custom User Interface matching Cloud DB structure
interface UserInfo {
  _id?: string;
  _openid: string;
  nickName?: string;
  avatarUrl?: string;
}

App<IAppOption>({
  globalData: {
    hasLogin: false,
    userInfo: undefined,
    env: "" 
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
      // Call cloud function to check if user exists in DB
      const res = await wx.cloud.callFunction({
        name: 'user-center',
        data: { action: 'login' }
      });
      
      const result = res.result as { success: boolean, isRegistered: boolean, userInfo: UserInfo };
      
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
