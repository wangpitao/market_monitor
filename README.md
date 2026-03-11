# Stock Assistant MiniProgram / 股票助手小程序

[English](#english) | [中文](#chinese)

<a name="english"></a>
## English

### Introduction
A WeChat MiniProgram for stock market monitoring and analysis, built with **WeChat Cloud Development** and **TDesign**. It provides real-time quotes, global indices, K-line charts, and AI-powered investment analysis.

### Features
- **Real-time Quotes**: Supports A-shares, Hong Kong stocks, and US stocks (via Sina Finance API).
- **Market Overview**: Real-time global indices and hot sector rankings.
- **Watchlist**: Cloud-synced watchlist with user authentication.
- **Stock Details**: Interactive charts, position management, and AI analysis.
- **AI Analysis**: Integration with Tencent Hunyuan/DeepSeek models for investment advice.
- **UI/UX**: Modern interface using TDesign components.

### Setup & Configuration
1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/stock-miniprogram.git
   ```
2. **Open in WeChat DevTools**: Import the project directory.
3. **Install Dependencies**:
   - `cloudfunctions/stock-service` -> `npm install`
   - `cloudfunctions/user-center` -> `npm install`
4. **Configuration**:
   - **AppID**: Replace `appid` in `project.config.json` or use `project.private.config.json`.
   - **Cloud Environment**: Replace `env` in `miniprogram/app.ts`.
5. **Deploy Cloud Functions**: Upload and deploy both functions.

---

<a name="chinese"></a>
## Chinese (中文)

### 简介
一个基于 **微信云开发** 和 **TDesign** 构建的股票行情助手小程序。提供实时行情、全球指数、K线图表以及基于AI的投资分析建议。

### 功能特性
- **实时行情**：支持A股、港股、美股实时数据（接入新浪财经API）。
- **市场概览**：实时显示全球主要指数及热门板块排行。
- **自选股**：基于云开发的自选股同步，支持用户登录鉴权。
- **个股详情**：包含交互式图表、持仓成本管理及AI智能分析。
- **AI决策**：集成腾讯混元/DeepSeek大模型。
- **UI体验**：使用 TDesign 组件库。

### 安装与配置
1. **克隆项目**：
   ```bash
   git clone https://github.com/your-username/stock-miniprogram.git
   ```
2. **导入开发者工具**：使用微信开发者工具导入项目目录。
3. **安装依赖**：
   - 进入 `cloudfunctions/stock-service` 目录运行 `npm install`。
   - 进入 `cloudfunctions/user-center` 目录运行 `npm install`。
4. **配置参数** (重要)：
   - **AppID**: 打开 `project.config.json`，将 `appid` 替换为您自己的小程序 AppID。建议使用 `project.private.config.json` 覆盖配置。
   - **云环境ID**: 打开 `miniprogram/app.ts`，将 `env` 替换为您的云开发环境 ID。
5. **部署云函数**：上传并部署云函数。

### 注意事项
- **隐私安全**：在提交代码或分享项目前，请确保已将 `project.config.json` 中的 `appid` 和 `miniprogram/app.ts` 中的 `env` 替换为占位符。
- **私有配置**：已配置忽略 `project.private.config.json`，您可以在此文件中设置个人的 `appid` 等信息而不被提交。
