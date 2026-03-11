// pages/me/me.js
const app = getApp()

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
      const res = await wx.cloud.callFunction({
        name: 'user-center',
        data: { action: 'login' }
      });
      const result = res.result;

      if (result.success && result.isRegistered) {
        app.globalData.hasLogin = true;
        app.globalData.userInfo = result.userInfo;
        this.setData({
          userInfo: result.userInfo,
          hasLogin: true
        });
        this.showMessage('success', '登录成功');
      } else {
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

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({ tempAvatarUrl: avatarUrl });
  },

  onNicknameChange(e) {
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
      const cloudPath = `avatars/${Date.now()}-${Math.floor(Math.random() * 1000)}.png`;
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: this.data.tempAvatarUrl,
      });

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
      
      const result = res.result;
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

  showMessage(type, content) {
    // 降级使用 wx.showToast 以避免组件实例方法调用失败
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
