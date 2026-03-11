// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { symbol, price, kline, position } = event;

  // Mock AI Analysis with structured JSON
  // In real scenario, call LLM API here.
  
  // Analyze Trend based on K-line (Simple logic)
  let trend = 'Neutral';
  let closePrices = [];
  if (kline && kline.length > 0) {
    closePrices = kline.map(k => parseFloat(k.close));
    const start = closePrices[0];
    const end = closePrices[closePrices.length - 1];
    if (end > start * 1.05) trend = 'Bullish';
    else if (end < start * 0.95) trend = 'Bearish';
  }

  // Analyze Position
  let action = 'hold';
  let riskLevel = 'medium';
  let reason = 'Market is volatile.';
  
  if (position) {
    const cost = parseFloat(position.cost);
    const current = parseFloat(price);
    const pnl = (current - cost) / cost;
    
    if (pnl < -0.1) {
      action = 'hold';
      reason = 'Price dropped significantly. RSI indicates oversold. Wait for rebound.';
      riskLevel = 'high';
    } else if (pnl > 0.2) {
      action = 'take_profit';
      reason = 'Significant profit achieved. Lock in gains.';
      riskLevel = 'low';
    }
  }

  const result = {
    trend: trend,
    support: [(parseFloat(price) * 0.9).toFixed(2)],
    resistance: [(parseFloat(price) * 1.1).toFixed(2)],
    signals: ["MACD Golden Cross", "RSI 45 (Neutral)"],
    risk_level: riskLevel,
    position_analysis: position ? `Current PnL: ${((parseFloat(price) - position.cost)/position.cost*100).toFixed(2)}%` : "No position data",
    action: action,
    reason: reason,
    stop_loss: (parseFloat(price) * 0.92).toFixed(2),
    take_profit: (parseFloat(price) * 1.15).toFixed(2),
    alert_conditions: ["Price drops below Support", "Volume spikes > 2x avg"]
  };

  return {
    symbol,
    data: result,
    timestamp: new Date().toISOString()
  }
}
