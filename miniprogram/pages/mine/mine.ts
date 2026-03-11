const defaultAvatarUrl = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0';

Page({
  data: {
    activeTab: 'mine',
    isLoggedIn: false,
    userInfo: {
      nickName: '',
      avatarUrl: ''
    },
    avatarUrl: defaultAvatarUrl,
    editingNickname: '',
    isEditingNickname: false,
    stats: {
      publishCount: 0,
      joinCount: 0,
      creditScore: 0
    },
    // 我的发布 / 我的参与 列表
    activeList: '', // '' | 'publish' | 'join'
    loadingList: false,
    myPublishList: [] as any[],
    myJoinList: [] as any[]
  },

  onLoad() {
    // 初始化云环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    
    wx.cloud.init({
      env: 'cloud1-0gn4ixonf3b9d5de',
      traceUser: true,
    });
    
    this.checkLoginStatus();
  },

  onShow() {
    // 返回页面时也刷新一次，确保状态及时更新
    this.checkLoginStatus();
    // 若已登录则刷新统计
    if (this.data.isLoggedIn) {
      this.refreshStats();
    }
  },

  // 统一应用用户数据：解析头像并更新UI/缓存
  async applyUser(user: any) {
    const avatarUrl = await this.resolveAvatarUrl(user);
    const mergedUser = { ...user, avatarUrl };
    wx.setStorageSync('cloudUser', mergedUser);
    this.setData({
      isLoggedIn: true,
      userInfo: { nickName: mergedUser.nickName || '', avatarUrl: mergedUser.avatarUrl || '' },
      avatarUrl: mergedUser.avatarUrl || defaultAvatarUrl,
      // 仅在未处于编辑态时，同步编辑昵称
      editingNickname: this.data.isEditingNickname ? this.data.editingNickname : (mergedUser.nickName || ''),
      stats: mergedUser.stats || this.data.stats,
    });
    // 覆盖本地统计，使用实时统计结果
    await this.refreshStats();
  },

  // 将 fileID 转为可展示的临时链接；若无则使用原本的 avatarUrl
  async resolveAvatarUrl(user: any): Promise<string> {
    try {
      if (user && user.avatarFileID) {
        console.log('获取头像临时链接:', user.avatarFileID);
        const r = await wx.cloud.getTempFileURL({ fileList: [user.avatarFileID] });
        const url = r?.fileList?.[0]?.tempFileURL;
        if (url) {
          console.log('头像临时链接获取成功:', url);
          return url;
        }
      }
      console.log('使用原始头像链接:', user?.avatarUrl);
      return user?.avatarUrl || '';
    } catch (e) {
      console.warn('获取头像临时链接失败，回退为原链接:', e);
      return user?.avatarUrl || '';
    }
  },

  // 刷新发布/参与统计
  async refreshStats() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getUserStats', data: {} }) as any
      const result = res && res.result ? res.result as any : {}
      if (result && result.success) {
        this.setData({
          'stats.publishCount': Number(result.publishCount) || 0,
          'stats.joinCount': Number(result.joinCount) || 0,
        })
      }
    } catch (e) {
      // 静默失败
    }
  },

  // 打开“我的发布”列表
  async openMyPublish() {
    if (!this.data.isLoggedIn) { wx.showToast({ title: '请先登录', icon: 'none' }); return }
    wx.navigateTo({ url: '/pages/mypublish/mypublish' })
  },

  // 打开“我的参与”列表
  async openMyJoin() {
    if (!this.data.isLoggedIn) { wx.showToast({ title: '请先登录', icon: 'none' }); return }
    wx.navigateTo({ url: '/pages/myjoin/myjoin' })
  },

  // 检查登录状态
  async checkLoginStatus() {
    try {
      console.log('检查登录状态');
      const user = wx.getStorageSync('cloudUser');
      if (user && user._id) {
        console.log('本地缓存中发现用户信息:', user);
        await this.applyUser(user);
      } else {
        console.log('本地缓存中无用户信息');
        this.setData({ isLoggedIn: false, editingNickname: '', avatarUrl: defaultAvatarUrl });
        
        // 尝试静默登录
        const openid = wx.getStorageSync('openid');
        if (openid) {
          console.log('发现openid，尝试静默登录');
          this.silentLogin();
        }
      }
    } catch (err) {
      console.error('检查登录状态出错:', err);
      this.setData({ isLoggedIn: false });
    }
  },
  
  // 静默登录：使用已有openid尝试获取用户信息
  async silentLogin() {
    try {
      console.log('开始静默登录');
      const res = await wx.cloud.callFunction({
        name: 'authLogin',
        data: {}
      });
      
      console.log('静默登录结果:', res);
      let result: any = res.result as any;
      if (typeof result === 'string') {
        try { result = JSON.parse(result); } catch (_) {}
      }
      
      const user = result?.user;
      if (user && user._id) {
        console.log('静默登录成功，用户信息:', user);
        await this.applyUser(user);
        return true;
      }
      
      console.log('静默登录失败，无有效用户信息');
      return false;
    } catch (err) {
      console.error('静默登录出错:', err);
      return false;
    }
  },

  // 云端登录/注册
  async cloudLogin(profile?: WechatMiniprogram.UserInfo) {
    try {
      console.log('开始登录，用户资料：', profile);
      wx.showLoading({ title: '登录中', mask: true });
      
      const res = await wx.cloud.callFunction({
        name: 'authLogin',
        data: {
          nickName: profile?.nickName || '',
          avatarUrl: profile?.avatarUrl || '',
        },
      });
      
      console.log('云函数返回原始结果：', res);
      wx.hideLoading();
      
      // 兼容 result 可能是对象或 JSON 字符串
      let result: any = res.result as any;
      if (typeof result === 'string') {
        try { result = JSON.parse(result); } catch (_) {}
      }
      
      console.log('解析后的结果：', result);
      const user = result?.user;
      const openid = result?.openid;
      
      if (openid) {
        wx.setStorageSync('openid', openid);
      }
      
      if (user) {
        console.log('用户数据：', user);
        console.log('昵称：', user.nickName);
        console.log('头像：', user.avatarUrl || user.avatarFileID);
        
        await this.applyUser(user);
        
        // 若云端昵称为“微信用户”，但前端拿到了真实昵称，则以真实昵称修正
        if (profile?.nickName && profile.nickName !== '微信用户' && user.nickName === '微信用户') {
          try {
            await wx.cloud.callFunction({ name: 'updateUser', data: { nickName: profile.nickName } });
            const fixedUser = { ...user, nickName: profile.nickName };
            await this.applyUser(fixedUser);
          } catch (fixErr) {
            console.warn('修正昵称失败：', fixErr);
          }
        }

        console.log('页面数据已更新：', this.data);
        wx.showToast({ title: '登录成功', icon: 'success' });
        return true;
      } else {
        console.warn('云函数返回空用户：', result);
        wx.showToast({ title: '登录失败：无用户数据', icon: 'none' });
        return false;
      }
    } catch (e) {
      wx.hideLoading();
      console.error('cloudLogin error:', e);
      wx.showToast({ title: '网络异常', icon: 'none' });
      return false;
    }
  },

  // 微信登录 + 云端建档
  onLogin() {
    if (wx.getUserProfile) {
      wx.getUserProfile({
        desc: '用于完善会员资料',
        lang: 'zh_CN',
        success: (res) => {
          console.log('获取用户资料成功:', res.userInfo);
          this.cloudLogin(res.userInfo);
        },
        fail: (err) => {
          console.log('获取用户资料失败:', err);
          wx.showModal({
            title: '需要授权',
            content: '请授权获取您的头像和昵称，以完善资料',
            confirmText: '去授权',
            cancelText: '取消',
            success: (mres) => {
              if (mres.confirm) {
                this.onLogin();
              }
            }
          });
        },
      });
    } else {
      // 老版本基础库兜底：无用户信息也建档
      console.log('当前基础库版本不支持getUserProfile');
      this.cloudLogin();
    }
  },

  // 昵称输入编辑态：获得焦点
  onNicknameFocus() {
    if (!this.data.isLoggedIn) return;
    this.setData({ isEditingNickname: true, editingNickname: this.data.userInfo.nickName || '' });
  },

  // 实时输入
  onNicknameInput(e: any) {
    if (!this.data.isLoggedIn) return;
    const val = e?.detail?.value ?? '';
    this.setData({ editingNickname: val });
  },

  // 一键登录：选择头像 + 获取昵称，然后建档
  async onLoginChooseAvatar(e: any) {
    try {
      wx.showLoading({ title: '处理中', mask: true });
      
      // 1) 头像（微信已做内容安全，只有合规才会触发）
      const avatarTemp = e?.detail?.avatarUrl;
      if (!avatarTemp) {
        wx.hideLoading();
        wx.showToast({ title: '请选择头像', icon: 'none' });
        return;
      }
      
      console.log('获取到头像临时路径:', avatarTemp);
      
      // 2) 昵称（getUserProfile）
      let profile: WechatMiniprogram.UserInfo | undefined = undefined;
      try {
        if (wx.getUserProfile) {
          const p: any = await new Promise((resolve, reject) => {
            wx.getUserProfile({
              desc: '用于完善会员资料',
              success: resolve,
              fail: reject,
            })
          });
          profile = p?.userInfo;
          console.log('获取用户资料成功:', profile);
        }
      } catch (err) {
        console.warn('获取用户资料失败:', err);
        // 继续流程，即使没有获取到昵称
      }
      
      // 3) 先上传头像
      let avatarFileID = '';
      try {
        const ext = avatarTemp.substring(avatarTemp.lastIndexOf('.')) || '.jpg';
        // 使用时间戳作为临时标识，登录后会用openid更新
        const tempId = Date.now().toString();
        const cloudPath = `user-avatars/temp-${tempId}/${Date.now()}${ext}`;
        console.log('开始上传头像:', cloudPath);
        const uploadRes = await wx.cloud.uploadFile({ 
          cloudPath, 
          filePath: avatarTemp
        });
        avatarFileID = uploadRes.fileID;
        console.log('头像上传成功:', avatarFileID);
      } catch (err) {
        console.error('头像上传失败:', err);
        wx.hideLoading();
        wx.showToast({ title: '头像上传失败', icon: 'none' });
        return;
      }
      
      // 4) 走云端建档，优先 fileID；若无 fileID 则用 profile.avatarUrl
      try {
        console.log('调用云函数 authLogin');
        const res = await wx.cloud.callFunction({
          name: 'authLogin',
          data: {
            nickName: profile?.nickName || '',
            avatarUrl: avatarFileID ? '' : (profile?.avatarUrl || ''),
            avatarFileID: avatarFileID || '',
          },
        });
        
        console.log('云函数返回原始结果:', res);
        let result: any = res.result as any;
        if (typeof result === 'string') { try { result = JSON.parse(result); } catch(_){} }
        console.log('解析后的结果:', result);
        
        let user = result?.user;
        const openid = result?.openid;
        
        if (openid) {
          wx.setStorageSync('openid', openid);
        }
        
        if (!user) {
          throw new Error('云函数返回的用户数据为空');
        }
        
        // 若上传了 fileID，确保写入 users，并归档 images
        if (avatarFileID && (!user.avatarFileID || user.avatarFileID !== avatarFileID)) {
          console.log('更新用户头像 FileID:', avatarFileID);
          await wx.cloud.callFunction({ 
            name: 'updateUser', 
            data: { 
              avatarFileID, 
              imageMeta: { source: 'login-choose-avatar' } 
            } 
          });
          user = { ...user, avatarFileID, avatarUrl: '' };
        }
        
        await this.applyUser(user);
        wx.hideLoading();
        wx.showToast({ title: '登录成功', icon: 'success' });
      } catch (err) {
        console.error('登录过程出错:', err);
        wx.hideLoading();
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('onLoginChooseAvatar error:', err);
      // 回退到老的登录路径
      this.onLogin();
    }
  },

  

  // 退出登录
  logout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('cloudUser');
          this.setData({
            isLoggedIn: false,
            userInfo: { nickName: '', avatarUrl: '' },
            stats: { publishCount: 0, joinCount: 0, creditScore: 0 }
          });
          wx.showToast({ title: '已退出登录', icon: 'success' });
        }
      }
    });
  },

  // 显示功能提示
  showFeature(e: any) {
    const feature = e.currentTarget.dataset.feature;
    wx.showToast({ title: `${feature}功能开发中`, icon: 'none' });
  },

  // 更换头像：选图 -> 上传到云存储 -> 更新用户资料 -> 刷新临时链接
  async onChangeAvatar() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    try {
      const choose = await wx.chooseImage({ count: 1, sizeType: ['compressed'] });
      const filePath = choose.tempFilePaths[0];
      const ext = filePath.substring(filePath.lastIndexOf('.')) || '.jpg';
      const user = wx.getStorageSync('cloudUser');
      const cloudPath = `user-avatars/${user._openid || 'unknown'}/${Date.now()}${ext}`;

      wx.showLoading({ title: '上传中', mask: true });
      const uploadRes = await wx.cloud.uploadFile({ 
        cloudPath, 
        filePath
      });
      const fileID = uploadRes.fileID;

      await wx.cloud.callFunction({ 
        name: 'updateUser', 
        data: { 
          userId: user?._id,
          avatarFileID: fileID, 
          avatarUrl: '',
          imageMeta: { source: 'changeAvatar' }
        } 
      });

      const newUser = { ...user, avatarFileID: fileID, avatarUrl: '' };
      await this.applyUser(newUser);

      wx.hideLoading();
      wx.showToast({ title: '头像已更新', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      console.error('更换头像失败：', e);
      wx.showToast({ title: '头像更新失败', icon: 'none' });
    }
  },

  // 微信官方头像选择（基础库>=2.24.4）
  async onChooseAvatar(e: any) {
    const tempPath = e?.detail?.avatarUrl;
    if (!tempPath) return;
    // 先本地更新显示，完全遵循示例交互
    this.setData({ avatarUrl: tempPath });

    // 未登录则仅本地显示，不做云端持久化
    if (!this.data.isLoggedIn) return;

    try {
      // 已登录则上传到云并更新资料
      const user = wx.getStorageSync('cloudUser');
      const ext = tempPath.substring(tempPath.lastIndexOf('.')) || '.jpg';
      const cloudPath = `user-avatars/${user._openid || 'unknown'}/${Date.now()}${ext}`;
      wx.showLoading({ title: '上传中', mask: true });
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath });
      const fileID = uploadRes.fileID;
      await wx.cloud.callFunction({ 
        name: 'updateUser', 
        data: { 
          userId: user?._id,
          avatarFileID: fileID, 
          avatarUrl: '',
          imageMeta: { source: 'chooseAvatar' } 
        } 
      });
      const newUser = { ...user, avatarFileID: fileID, avatarUrl: '' };
      await this.applyUser(newUser);
      wx.hideLoading();
      wx.showToast({ title: '头像已更新', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      console.error('onChooseAvatar error:', err);
      wx.showToast({ title: '头像更新失败', icon: 'none' });
    }
  },

  // 微信官方昵称输入（基础库>=2.24.4），按示例在 onBlur 时取输入值
  async onNicknameBlur(e: any) {
    const val = (e?.detail?.value || '').trim();
    if (!val) return;
    if (!this.data.isLoggedIn) return; // 未登录仅本地输入，不持久化
    try {
      const user = wx.getStorageSync('cloudUser');
      await wx.cloud.callFunction({ name: 'updateUser', data: { userId: user?._id, nickName: val } });
      const newUser = { ...user, nickName: val };
      await this.applyUser(newUser);
      wx.showToast({ title: '昵称已更新', icon: 'success' });
    } catch (err) {
      console.error('onNicknameBlur error:', err);
      wx.showToast({ title: '昵称更新失败', icon: 'none' });
    }
  },

  // 底部导航切换
  onTabChange(e: any) {
    const value = e.detail.value;
    this.setData({ activeTab: value });
    if (value === 'index') {
      wx.reLaunch({ url: '/pages/index/index' });
    } else if (value === 'venue') {
      wx.reLaunch({ url: '/pages/venue/venue' });
    } else if (value === 'create') {
      wx.reLaunch({ url: '/pages/create/create' });
    } else if (value === 'mine') {
      return;
    }
  }
});

// 为 WXML 使用提供简单的时间格式化（局部函数）
function formatTs(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const mm = (d.getMonth()+1).toString().padStart(2,'0')
  const dd = d.getDate().toString().padStart(2,'0')
  const hh = d.getHours().toString().padStart(2,'0')
  const mi = d.getMinutes().toString().padStart(2,'0')
  return `${mm}-${dd} ${hh}:${mi}`
}