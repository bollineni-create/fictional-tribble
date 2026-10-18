# Strategy Lab

A local workspace for rule-based trading strategies. Describe an idea in plain English, read and edit the code it produces, backtest it on real market history, then paper trade it on live prices.

Everything runs on your machine. No account is needed, and the app never connects to a brokerage or sends real orders. Paper trades are simulated fills at the latest quote.

## Run it

Requires Node.js 18 or newer.

```bash
cd strategy-lab
npm install
npm start
```

Then open http://127.0.0.1:5173. Set `PORT` to use a different port.

### Market data

Live data works out of the box, with no API keys:

| Symbols | Example | Source |
|---|---|---|
| Stocks, ETFs | `AAPL`, `SPY`, `QQQ` | Yahoo Finance public chart endpoint |
| Indices | `^GSPC`, `^IXIC` | Yahoo Finance |
| Crypto pairs | `BTC-USD`, `ETH-USD`, `SOL-USD` | Coinbase Exchange public API |

The Yahoo Finance endpoint is unofficial. It works without a key, but it can rate-limit or change without notice, and stock quotes may be delayed. For an official stock feed, create a free [Alpaca](https://alpaca.markets) account and start the server with its keys:

```bash
ALPACA_API_KEY_ID=... ALPACA_API_SECRET_KEY=... npm start
```

That switches stocks to Alpaca's free real-time IEX feed. If you have a paid Alpaca data plan, set `ALPACA_FEED=sip` for consolidated quotes from all US exchanges. Crypto always comes from Coinbase.

Backtests default to **Max** history, meaning every daily bar the source has: for example AAPL from 1980, SPY from 1993, the S&P 500 index (`^GSPC`) from 1927, and BTC-USD on Coinbase from 2015. Alpaca stock history starts in 2016. Use the History menu to limit a test to 1, 3, 5, 10 or 20 years. Charts switch to a log scale when prices span more than 10x.

Yahoo prices are adjusted for splits but not dividends, so buy & hold and strategy returns leave out dividend income. Index symbols like `^GSPC` are price indices with no dividends at all.

The Monitor tab polls quotes every 2 to 60 seconds and updates the current day's bar, so paper strategies react to intraday prices. A strategy's entry and exit rules act at most once per daily bar, while stop losses and take profits can trigger at any update.

### Optional: AI strategy builder

Without an API key, plain-English prompts go to a built-in builder that understands common setups: SMA/EMA crossovers, RSI, Bollinger Bands, MACD, breakouts, stop losses and take profits.

To have Claude write strategies from any description, and edit existing ones, start the server with an Anthropic API key:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

Requests use `claude-opus-5-5` with server-side refusal fallback enabled. If a request fails, the app falls back to the built-in builder.

## Features

- **Build & Test**: chat-style strategy builder, editable code, and a backtest on daily bars. The backtest reports total return vs. buy & hold, CAGR, max drawdown, Sharpe, win rate, profit factor and time in market, with an equity curve, a price chart with trade markers, and a trade list you can export as CSV.
- **Data**: live market history by default. You can also import a CSV with `Date` and `Close` columns (`Open`, `High`, `Low` and `Volume` are optional), or switch to a simulated series for offline use.
- **Monitor**: a watchlist with live quotes, price alerts (with browser notifications), paper-trading strategies with live P&L, and an activity log. A simulated feed is available for when markets are closed or you're offline.
- **Library**: starter strategies plus the ones you save.

Saved strategies, the watchlist, alerts and paper positions are stored in your browser's local storage.

## Strategy code format

A strategy is the body of a function that receives `data` and `ta` and returns entry and exit rules:

```js
const fast = ta.ema(data.close, 9);
const slow = ta.ema(data.close, 21);

return {
  entry: (i) => ta.crossover(fast, slow, i),
  exit: (i) => ta.crossunder(fast, slow, i),
  stopLoss: 0.03,   // optional, 3% below entry
  takeProfit: 0.06, // optional, 6% above entry
};
```

- `data` has aligned arrays: `time`, `open`, `high`, `low`, `close`, `volume`.
- Rules are checked at each bar's close. Orders fill at the next bar's open. Stops and targets are checked against each bar's high and low.
- Positions are long-only and all-in. Fees and slippage are set in basis points.
- Helpers: `ta.sma`, `ta.ema`, `ta.rsi`, `ta.stdev`, `ta.roc`, `ta.bollinger`, `ta.macd`, `ta.atr`, `ta.highest`, `ta.lowest`, `ta.crossover`, `ta.crossunder`.

Strategy code runs in your browser, so review AI-generated code before running it.

## Disclaimer

For research and education only. Backtests on historical or simulated data do not predict future results, and nothing here is investment advice.
