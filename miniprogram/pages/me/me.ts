// pages/me/me.ts
const app = getApp<IAppOption>()

Page({
  data: {
    userInfo: {},
    hasLogin: false,
    loginPopupVisible: false,
    tempAvatarUrl: '',
    tempNickname: '',
    isRegistering: false
  },

  onShow() {
    this.refreshUserInfo();
  },

  refreshUserInfo() {
    if (app.globalData.hasLogin) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasLogin: true
      });
    }
  },

  async onLoginTap() {
    console.log('Login tapped');
    wx.showLoading({ title: '检查登录状态' });
    try {
      // 1. Check if user exists in Cloud DB
      const res = await wx.cloud.callFunction({
        name: 'user-center',
        data: { action: 'login' }
      });
      const result = res.result as any;

      if (result.success && result.isRegistered) {
        // Already registered, login success
        app.globalData.hasLogin = true;
        app.globalData.userInfo = result.userInfo;
        this.setData({
          userInfo: result.userInfo,
          hasLogin: true
        });
        this.showMessage('success', '登录成功');
      } else {
        // Not registered, show popup
        this.setData({ loginPopupVisible: true });
      }
    } catch (e) {
      console.error(e);
      this.showMessage('error', '登录检查失败');
    } finally {
      wx.hideLoading();
    }
  },

  onPopupClose() {
    this.setData({ loginPopupVisible: false });
  },

  onChooseAvatar(e: any) {
    const { avatarUrl } = e.detail;
    this.setData({ tempAvatarUrl: avatarUrl });
  },

  onNicknameChange(e: any) {
    const { value } = e.detail;
    this.setData({ tempNickname: value });
  },

  async onSubmitRegister() {
    if (!this.data.tempAvatarUrl || !this.data.tempNickname) {
      this.showMessage('warning', '请补充头像和昵称');
      return;
    }

    this.setData({ isRegistering: true });

    try {
      // 1. Upload Avatar to Cloud Storage
      const cloudPath = `avatars/${Date.now()}-${Math.floor(Math.random() * 1000)}.png`;
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: this.data.tempAvatarUrl,
      });

      // 2. Call Cloud Function to Register
      const res = await wx.cloud.callFunction({
        name: 'user-center',
        data: {
          action: 'register',
          userData: {
            avatarUrl: uploadRes.fileID,
            nickName: this.data.tempNickname
          }
        }
      });
      
      const result = res.result as any;
      if (result.success) {
         app.globalData.hasLogin = true;
         app.globalData.userInfo = result.userInfo;
         this.setData({
           userInfo: result.userInfo,
           hasLogin: true,
           loginPopupVisible: false
         });
         this.showMessage('success', '注册成功');
      }

    } catch (e) {
      console.error(e);
      this.showMessage('error', '注册失败');
    } finally {
      this.setData({ isRegistering: false });
    }
  },

  showMessage(type: string, content: string) {
    const Message = this.selectComponent('#t-message');
    if (Message) {
      Message.show({
        context: this,
        offset: [20, 32],
        content: content,
        theme: type,
        duration: 2000,
      });
    } else {
      wx.showToast({ title: content, icon: 'none' });
    }
  }
})
