// Shared Types

interface StockQuote {
  symbol: string;
  price: number;
  change: string; // e.g., "+1.2%"
  timestamp: string;
}

interface WatchlistEntry {
  _id: string;
  _openid: string;
  symbol: string;
  name: string;
  addedAt: Date;
}

interface AIAdvice {
  symbol: string;
  analysis: string;
  advice: 'BUY' | 'SELL' | 'HOLD';
  timestamp: string;
}
