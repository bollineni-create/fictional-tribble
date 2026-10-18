# Strategy Lab

A local workspace for rule-based trading strategies. Describe an idea in plain English, read and edit the code it produces, backtest it, then paper trade it on a simulated live feed.

Everything runs on your machine. No account is needed, and the app never connects to a brokerage or sends real orders.

## Run it

Requires Node.js 18 or newer.

```bash
cd strategy-lab
npm install
npm start
```

Then open http://127.0.0.1:5173. Set `PORT` to use a different port.

### Optional: AI strategy builder

Without an API key, plain-English prompts go to a built-in builder that understands common setups: SMA/EMA crossovers, RSI, Bollinger Bands, MACD, breakouts, stop losses and take profits.

To have Claude write strategies from any description, and edit existing ones, start the server with an Anthropic API key:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

Requests use `claude-opus-5-5` with server-side refusal fallback enabled. If a request fails, the app falls back to the built-in builder.

## Features

- **Build & Test**: chat-style strategy builder, editable code, and a backtest on daily bars. The backtest reports total return vs. buy & hold, CAGR, max drawdown, Sharpe, win rate, profit factor and time in market, with an equity curve, a price chart with trade markers, and a trade list you can export as CSV.
- **Data**: each symbol name gives a repeatable simulated price series. To test on real prices, import a CSV with `Date` and `Close` columns (`Open`, `High`, `Low` and `Volume` are optional), such as a daily-history export from your data provider.
- **Monitor**: a watchlist on a simulated live feed, price alerts (with browser notifications), paper-trading strategies with live P&L, and an activity log.
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
