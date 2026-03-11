// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const usersCollection = db.collection('user')

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  switch (event.action) {
    case 'login': {
      // 尝试查询用户
      const res = await usersCollection.where({
        _openid: openid
      }).get()

      if (res.data.length > 0) {
        return {
          success: true,
          userInfo: res.data[0],
          isRegistered: true
        }
      } else {
        return {
          success: true,
          userInfo: { _openid: openid }, // 仅返回 openid，提示前端需要注册/完善信息
          isRegistered: false
        }
      }
    }

    case 'register': {
      const { avatarUrl, nickName } = event.userData
      const createTime = db.serverDate()
      
      // 检查是否已存在（避免重复注册）
      const checkRes = await usersCollection.where({ _openid: openid }).get()
      if (checkRes.data.length > 0) {
        // 更新信息
        await usersCollection.doc(checkRes.data[0]._id).update({
          data: { avatarUrl, nickName, updateTime: createTime }
        })
        return { success: true, userInfo: { ...checkRes.data[0], avatarUrl, nickName }, isRegistered: true }
      }

      // 新增用户
      const addRes = await usersCollection.add({
        data: {
          _openid: openid,
          avatarUrl,
          nickName,
          createTime,
          updateTime: createTime
        }
      })

      return {
        success: true,
        userInfo: {
          _id: addRes._id,
          _openid: openid,
          avatarUrl,
          nickName
        },
        isRegistered: true
      }
    }
    
    default:
      return { error: 'Unknown action' }
  }
}
