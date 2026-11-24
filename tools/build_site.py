"""Writes the gilt website's pages (site/*.html) from one shared shell: the same head, preloader,
floating header and footer as the other Mouse 33-family sites, with the gilt wordmark from
brand/out/logo.json stamped into <symbol id="gilt">.

    python -I tools/build_site.py
"""
import json, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SITE = os.path.join(ROOT, "site")
VERSION = "0.3.0"
EXE = f"downloads/gilt_{VERSION}_x64-setup.exe"
exe_path = os.path.join(SITE, EXE)
SIZE = f"{os.path.getsize(exe_path) / 1e6:.1f} MB" if os.path.exists(exe_path) else "3 MB"
logo = json.load(open(os.path.join(ROOT, "brand", "out", "logo.json")))
DESC = "gilt is paper trading for Windows: buy and sell any stock at its live price with pretend money."
TAGLINE = "Trade the real market,<br>with pretend money."


def shell(page, title, body, extra_js=""):
    nav = "".join(
        f'<a href="{href}"{" aria-current=\"page\"" if key == page else ""}>{label}</a>'
        for key, href, label in [("home", "index.html", "Home"), ("features", "features.html", "Features"),
                                 ("download", "download.html", "Download")])
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{DESC}">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111111" media="(prefers-color-scheme: dark)">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="gilt">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{DESC}">
<meta property="og:image" content="https://ophidianp.github.io/gilt/og.png">
<meta name="twitter:card" content="summary_large_image">
<script>try{{var t=localStorage.getItem("gilt-theme");if(t)document.documentElement.dataset.theme=t;if(!sessionStorage.getItem("gilt-pre")&&!matchMedia("(prefers-reduced-motion: reduce)").matches){{document.documentElement.classList.add("preload");sessionStorage.setItem("gilt-pre","1")}}}}catch(e){{}}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;family=Inter+Tight:wght@500;600;700&amp;family=JetBrains+Mono:wght@400;500&amp;display=swap">
<link rel="stylesheet" href="assets/site.css?v=2">
<script src="assets/site.js?v=2" defer></script>{extra_js}
</head>
<body>
<div class="pre" aria-hidden="true"><div class="pre-in">
  <span class="lgs"><svg class="ghost"><use href="#gilt"/></svg><svg class="fillp"><use href="#gilt"/></svg></span>
  <p>{TAGLINE}</p>
</div></div>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="gilt" viewBox="{logo['viewBox']}"><path fill="currentColor" d="{logo['word']}"/></symbol>
</svg>

<header class="hdr" id="hdr">
  <div class="wrap">
    <a class="logo lgs" href="index.html" aria-label="gilt, home"><svg class="base" aria-hidden="true"><use href="#gilt"/></svg><svg class="fillp" aria-hidden="true"><use href="#gilt"/></svg></a>
    <nav class="nav" id="nav" aria-label="Main">
      {nav}
    </nav>
    <div class="tools">
      <span class="kbd">v{VERSION}</span>
      <button class="ib" id="theme" type="button" aria-label="Switch light or dark mode">
        <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>
        <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      </button>
      <a class="pill sm" href="{EXE}" style="margin-left:8px">Download</a>
      <button class="ib" id="menu" type="button" aria-label="Menu" aria-controls="nav" aria-expanded="false">
        <svg class="bars" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 8h16M4 16h16"/></svg>
        <svg class="x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
  </div>
</header>

<main>
{body}
</main>

<footer><div class="wrap foot-logo"><span class="lgs" role="img" aria-label="gilt"><svg class="ghost"><use href="#gilt"/></svg><svg class="fillp"><use href="#gilt"/></svg></span><p class="foot-by">by <a href="https://ophidianp.github.io/">Pavan Nemani</a></p></div><div class="wrap fine"><span>&copy; Pavan Nemani · All rights reserved · Pretend money on real prices. Not investment advice.</span><span><a href="download.html">Download</a><a href="https://ophidianp.github.io/">Portfolio ↗</a></span></div></footer>
</body>
</html>
"""


DL = f'<a class="pill acc" href="{EXE}">Download for Windows <span class="ar dn">↓</span></a>'

HOME = f"""  <section class="hero" id="top">
    <div class="wrap">
      <div class="hero-grid">
        <div>
          <p class="eyebrow in">Paper trading for Windows · <b>{VERSION}</b></p>
          <h1 class="in d1" style="margin-top:22px">Trade the real market.<br><em>With pretend money.</em></h1>
        </div>
        <div class="hero-side">
          <p class="lede in d2">Pick how much pretend cash you start with, then buy and sell any stock at its live price. Real order types, a portfolio that moves every few seconds, and nothing real at stake.</p>
          <div class="cta in d3">{DL}<a class="pill" href="features.html">See the features <span class="ar">→</span></a></div>
          <p class="fine in d4">gilt {VERSION} · Windows 10 and 11, 64-bit · Free · No account · <a href="download.html">Install notes</a></p>
        </div>
      </div>
      <div class="ph stage zoom">
        <div class="pmock" aria-label="The gilt app's Portfolio screen">
          <div class="pm-tabs"><span>Portfolio</span><span>Markets</span><span>Orders</span><small><i></i>Live</small></div>
          <div class="pm-body">
            <div>
              <p class="eyebrow">Paper account · opened with $10,000.00</p>
              <div class="pm-val" id="pm-val">$10,482.16</div>
              <p class="pm-chg up" id="pm-chg">+$482.16 (+4.82%) all time</p>
              <svg class="pm-chart" viewBox="0 0 400 90" preserveAspectRatio="none" aria-hidden="true"><polygon id="pm-area"/><polyline id="pm-line"/></svg>
            </div>
            <div class="pm-ticket">
              <div class="pm-seg"><span>Buy</span><span>Sell</span></div>
              <div class="pm-row"><span>NVDA · Market</span><b>5 shares</b></div>
              <div class="pm-row"><span>Price now</span><b id="pm-px">$153.42</b></div>
              <div class="pm-row"><span>Buying power</span><b>$9,232.90</b></div>
              <div class="pm-btn">Place buy order</div>
              <div class="pm-toast" id="pm-toast">Bought 5 NVDA at $153.42.</div>
            </div>
          </div>
        </div>
      </div>
      <div class="ticks">
        <div class="rv"><span>01</span><b>Live prices, every few seconds</b></div>
        <div class="rv d1"><span>02</span><b>Market, limit and stop orders</b></div>
        <div class="rv d2"><span>03</span><b>Start with any amount</b></div>
        <div class="rv d3"><span>04</span><b>Nothing real at stake</b></div>
      </div>
    </div>
    <div class="marq" aria-hidden="true"><div class="track">{"".join(f"<span>{t}</span>" for t in ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "META", "GOOGL", "AMD", "PLTR", "SPY", "QQQ", "BTC-USD"] * 2)}</div></div>
  </section>

  <section class="tear" id="team">
    <div class="pin"><div class="wrap grid">
      <div>
        <p class="eyebrow">A trading desk, minus the risk</p>
        <h2 style="margin-top:18px;font-size:clamp(32px,3.8vw,54px)">Practice like it's real. <em>Lose nothing.</em></h2>
        <p class="intro">Every price in gilt is the live market price, and every order fills the way it would at a broker. The only thing that's pretend is the money.</p>
        <ol class="steps">
          <li class="on" data-lbl="Portfolio"><div class="t">Your whole account, live <small>01 / Portfolio</small></div><div class="x"><p>Account value, today's change, buying power, open and closed P/L, and a chart of your account over time.</p><ul class="chips"><li class="on"><span>value</span></li><li><span>positions</span></li><li><span>P/L</span></li><li><span>buying power</span></li><li><span>history</span></li></ul><a class="more" href="features.html#portfolio">Explore the portfolio <span class="ar">→</span></a></div></li>
          <li data-lbl="Orders"><div class="t">Real order types <small>02 / Orders</small></div><div class="x"><p>Market orders fill now. Limit and stop orders wait until the price gets there, even with gilt closed in between.</p><a class="more" href="features.html#orders">Explore orders <span class="ar">→</span></a></div></li>
          <li data-lbl="Markets"><div class="t">Anything with a ticker <small>03 / Markets</small></div><div class="x"><p>Search any stock, ETF or crypto with <kbd>Ctrl K</kbd>, keep a watchlist, and see the biggest US companies at a glance.</p><a class="more" href="features.html#markets">Explore markets <span class="ar">→</span></a></div></li>
        </ol>
        <div class="bar"><i id="bar"></i></div>
        <p style="margin-top:24px"><a class="pill" href="features.html">See everything it does <span class="ar">↗</span></a></p>
      </div>
      <div class="ph tstage" id="tstage" data-s="0" aria-hidden="true">
        <div class="bd"></div>
        <div class="tile t1" style="left:6%;top:13%;width:52%;height:39%"><div class="th">Account value<em>live</em></div><div class="big">$10,482.16</div><div class="sub">+$482.16 (+4.82%)</div><svg class="lc" viewBox="0 0 100 40" preserveAspectRatio="none"><polygon points="0,34 10,31 20,32 30,26 40,28 50,21 60,23 70,15 80,17 90,10 100,8 100,40 0,40"/><polyline points="0,34 10,31 20,32 30,26 40,28 50,21 60,23 70,15 80,17 90,10 100,8"/></svg></div>
        <div class="tile t2 nd" style="left:62%;top:13%;width:32%;height:39%"><div class="th"><i></i>Buy 2 NVDA<em>waiting</em></div><div class="prow"><span>Type</span><b>Limit</b></div><div class="prow"><span>Limit price</span><b>$150.00</b></div><div class="prow"><span>Price now</span><b>$153.42</b></div><div class="prow"><span>Held back</span><b>$300.00</b></div></div>
        <div class="tile t3 wk" style="left:6%;top:56%;width:34%;height:34%"><div class="th"><i></i>Positions</div><div class="prow"><b>NVDA</b><span class="up">+$12.40</span></div><div class="prow"><b>AAPL</b><span class="up">+$31.05</span></div><div class="prow"><b>TSLA</b><span class="dn">−$8.20</span></div><div class="prow"><b>SPY</b><span class="up">+$4.66</span></div></div>
        <div class="tile note side" style="left:44%;top:56%;width:22%;height:24%"><div class="th">Buying power</div><div class="big">$6,104</div></div>
        <div class="tile side" style="left:70%;top:56%;width:24%;height:34%"><div class="th">Watchlist</div><div class="prow"><b>AMD</b><span class="dn">−0.8%</span></div><div class="prow"><b>PLTR</b><span class="up">+1.4%</span></div><div class="prow"><b>COIN</b><span class="up">+2.1%</span></div></div>
        <div class="tile new mk n1" style="left:44%;top:56%;width:15%;height:23%"><div class="th">AMD</div><div class="big">$410.65</div><svg class="lc r" viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points="0,10 20,14 40,12 60,22 80,20 100,28"/></svg></div>
        <div class="tile new mk n2" style="left:61.5%;top:56%;width:15%;height:23%"><div class="th">PLTR</div><div class="big">$161.54</div><svg class="lc g" viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points="0,30 20,26 40,28 60,18 80,16 100,9"/></svg></div>
        <div class="tile new mk n3" style="left:79%;top:56%;width:15%;height:23%"><div class="th">COIN</div><div class="big">$104.09</div><svg class="lc g" viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points="0,26 20,28 40,20 60,22 80,12 100,10"/></svg></div>
        <div class="mmap"><b>Orders</b><div><i style="background:var(--warn)"></i>Buy 2 NVDA · limit<span>waiting</span></div><div><i style="background:var(--warn)"></i>Sell 4 TSLA · stop<span>waiting</span></div><div><i style="background:var(--acc)"></i>Buy 5 AAPL · market<span>filled</span></div></div>
        <div class="cbar"><span>⌕</span><code>Search any stock to trade</code><small>Ctrl K</small></div>
        <span class="lbl" id="tlbl">Portfolio</span>
      </div>
    </div></div>
  </section>

  <section class="blk tint">
    <div class="wrap split">
      <div class="blk-head"><div><p class="eyebrow rv">Built for practice</p><h2 class="rv d1">Learn how orders work. <em>For free.</em></h2><p class="lede rv d2">gilt behaves like a real brokerage account, so what you learn carries over: fills, buying power, waiting orders and the market's hours.</p></div></div>
      <div class="rows">
        <div class="row rv"><p class="eyebrow">Fills</p><div><h3>The real price, right now</h3><p>Market orders fill at the live price. A limit buy fills at your price or lower, a stop sell once the price falls to your stop.</p></div></div>
        <div class="row rv"><p class="eyebrow">Buying power</p><div><h3>Cash is held back for waiting orders</h3><p>Place a limit buy and its cost is set aside, so you can't spend the same dollar twice. Sell orders hold their shares the same way.</p></div></div>
        <div class="row rv"><p class="eyebrow">Market hours</p><div><h3>Closed means closed</h3><p>Order after 4 PM and a market order waits for the next open, like it would at a broker. Crypto trades around the clock.</p></div></div>
        <div class="row rv"><p class="eyebrow">Shares or dollars</p><div><h3>Buy $500 of anything</h3><p>Enter shares, or a dollar amount and gilt works out the fractional shares. Max fills in everything you can afford.</p></div></div>
        <div class="row rv"><p class="eyebrow">Results</p><div><h3>See how you'd really do</h3><p>Open and closed P/L, how many of your sells were winners, and your account's value over time, recorded every minute gilt is open.</p></div></div>
      </div>
    </div>
  </section>

  <section class="blk">
    <div class="wrap">
      <div class="blk-head"><div><p class="eyebrow rv">Up and running fast</p><h2 class="rv d1">Install. Choose your cash. <em>Make a trade.</em></h2></div></div>
      <div class="cards">
        <div class="card rv"><div class="num">01</div><h3>Install</h3><p>Get gilt for Windows. It's a {SIZE} download with no sign-up.</p></div>
        <div class="card rv d1"><div class="num">02</div><h3>Choose your starting cash</h3><p>$1,000, $10,000, $1,000,000 or any amount you like. Start over whenever you want.</p></div>
        <div class="card rv d2"><div class="num">03</div><h3>Place your first order</h3><p>Press <kbd>Ctrl K</kbd>, search any stock, pick Buy, and watch your portfolio move with the market.</p></div>
      </div>
      <p class="rv" style="margin-top:40px"><a class="pill" href="download.html">Get started with gilt <span class="ar">↗</span></a></p>
    </div>
  </section>

  <section class="blk tint">
    <div class="wrap">
      <div class="blk-head">
        <div><p class="eyebrow rv">Trade anything</p><h2 class="rv d1">If it has a ticker, <em>you can trade it.</em></h2></div>
        <p class="lede rv d2">US stocks, ETFs, mutual funds and crypto, priced live from Yahoo Finance's public market data.</p>
      </div>
      <ul class="agents rv"><li>NVDA</li><li>AAPL</li><li>MSFT</li><li>TSLA</li><li>AMZN</li><li>META</li><li>SPY</li><li>QQQ</li><li>VOO</li><li>BTC-USD</li><li>ETH-USD</li><li class="on">Any ticker you search</li></ul>
      <p class="note rv" style="margin-top:32px">Prices are usually real time for US stocks and can be delayed for some funds · gilt never shows news, ads or notifications</p>
    </div>
  </section>

  <section class="blk">
    <div class="wrap split">
      <div class="blk-head"><div><p class="eyebrow rv">Good to know</p><h2 class="rv d1">A few quick <em>answers.</em></h2></div></div>
      <div class="faq rv">
        <details><summary>Is any of the money real?</summary><p>No. Your starting cash, every trade and every gain or loss only exist inside gilt on your PC. You can't deposit, withdraw or lose real money, and gilt never asks for a bank or brokerage login.</p></details>
        <details><summary>Are the prices real?</summary><p>Yes. gilt reads live quotes from Yahoo Finance's public market data every 3 seconds while the US market is open. Orders fill at that price, with no fees.</p></details>
        <details><summary>What happens when the market is closed?</summary><p>Market orders wait and fill at the next open. Limit and stop orders wait until the price is reached during market hours. Crypto trades any time.</p></details>
        <details><summary>Will my orders fill if gilt is closed?</summary><p>They fill the next time gilt is open and sees the price reach your limit or stop. gilt has no servers, so nothing runs while it's closed.</p></details>
        <details><summary>Is gilt investment advice?</summary><p>No. It's a place to practice. Results with pretend money, no fees and instant fills will differ from real trading.</p></details>
      </div>
    </div>
  </section>

  <section class="blk flush">
    <div class="wrap close">
      <h2 class="rv">Practice on the real market. <em>Risk nothing.</em></h2>
      <p class="lede rv d1">Free for Windows 10 and 11, 64-bit. No account, no bank, no real money.</p>
      <div class="cta rv d2">{DL}</div>
    </div>
  </section>"""

FEATURES = """  <section class="hero">
    <div class="wrap">
      <div class="hero-grid">
        <div><p class="eyebrow in">Features</p><h1 class="in d1" style="margin-top:22px">A brokerage, <em>minus the money.</em></h1></div>
        <div class="hero-side">
          <p class="lede in d2">A tour of what gilt does, from the paper account to the small touches that make it feel like the real thing.</p>
          <ul class="chips in d3"><li><a href="#portfolio">Portfolio</a></li><li><a href="#orders">Orders</a></li><li><a href="#markets">Markets</a></li><li><a href="#stock">Stock pages</a></li><li><a href="#window">The window</a></li><li><a href="#privacy">Your data</a></li></ul>
        </div>
      </div>
    </div>
  </section>

  <section class="blk" id="portfolio">
    <div class="wrap">
      <div class="blk-head"><div><p class="eyebrow rv">01 · Portfolio</p><h2 class="rv d1">Your account, <em>always live.</em></h2></div></div>
      <div class="cards">
        <div class="card rv wide"><h3>Any starting amount</h3><p>Open a paper account with $1 up to $1,000,000,000, or tap $1K, $10K, $100K or $1M. Start over with a new amount whenever you want.</p></div>
        <div class="card rv d1"><h3>Account value</h3><p>Cash plus everything you hold at live prices, with today's change and your change since you started.</p></div>
        <div class="card rv d2"><h3>Value over time</h3><p>gilt records your account's value every minute it's open and charts it for the day, week, month or all time.</p></div>
        <div class="card rv"><h3>Positions</h3><p>Shares, average cost, price, value, today's change, total return and how much of your account each one is.</p></div>
        <div class="card rv d1 wide"><h3>Open and closed P/L</h3><p>See what you're up or down on what you hold, what you've locked in by selling, and how many of your sells were winners.</p></div>
      </div>
    </div>
  </section>
  <section class="blk tint" id="orders">
    <div class="wrap">
      <div class="blk-head"><div><p class="eyebrow rv">02 · Orders</p><h2 class="rv d1">Real order types. <em>Real rules.</em></h2></div></div>
      <div class="cards">
        <div class="card rv"><h3>Market</h3><p>Buys or sells right away at the live price. Placed while the market is closed, it waits and fills at the next open.</p></div>
        <div class="card rv d1"><h3>Limit</h3><p>Buys only at your price or lower, or sells only at your price or higher. It waits until the market gets there.</p></div>
        <div class="card rv d2"><h3>Stop</h3><p>Sells once the price falls to your stop, to cap a loss, or buys once it rises to it.</p></div>
        <div class="card rv wide"><h3>Buying power</h3><p>Waiting buy orders hold back their cost and waiting sells hold back their shares, so the account never promises the same money twice.</p></div>
        <div class="card rv d1"><h3>Review first</h3><p>Every order shows exactly what will happen, and roughly what it costs, before you place it.</p></div>
        <div class="card rv wide"><h3>Shares or dollars</h3><p>Type a number of shares, or a dollar amount and gilt works out the fractional shares. Max fills in all you can afford, and Sell all closes a position.</p></div>
        <div class="card rv d1"><h3>Full history</h3><p>Every fill, cancel and rejection, with its price, total and P/L, in the Orders tab.</p></div>
      </div>
      <p class="note rv" style="margin-top:24px"><strong>Like a broker, mostly.</strong> Fills happen at the last live price with no fees, slippage or partial fills, so real results would differ a little.</p>
    </div>
  </section>
  <section class="blk" id="markets">
    <div class="wrap">
      <div class="blk-head"><div><p class="eyebrow rv">03 · Markets</p><h2 class="rv d1">Find something <em>to trade.</em></h2></div></div>
      <div class="cards">
        <div class="card rv wide"><h3>Search anything</h3><p>Press <kbd>Ctrl K</kbd> from anywhere and type a name or ticker. Stocks, ETFs, mutual funds, indexes and crypto all work.</p></div>
        <div class="card rv d1"><h3>Watchlist</h3><p>Your stocks in the sidebar with live prices that flash green or red as they move.</p></div>
        <div class="card rv d2"><h3>Biggest US companies</h3><p>The ten largest, with price, change and today's sparkline, one click from their page.</p></div>
      </div>
    </div>
  </section>
  <section class="blk tint" id="stock">
    <div class="wrap">
      <div class="blk-head"><div><p class="eyebrow rv">04 · Stock pages</p><h2 class="rv d1">One stock, <em>one ticket.</em></h2></div></div>
      <div class="cards">
        <div class="card rv wide"><h3>Charts from a day to five years</h3><p>1D, 1W, 1M, 3M, 1Y and 5Y. The one-day chart fills in across the session and marks yesterday's close. Hover for the exact price and time.</p></div>
        <div class="card rv d1"><h3>Order ticket</h3><p>Buy or sell sits right beside the chart, with live price, estimated cost and buying power.</p></div>
        <div class="card rv d2"><h3>Your position</h3><p>Shares, average cost, value and return for that stock, plus its orders.</p></div>
        <div class="card rv wide"><h3>Full-screen chart</h3><p>One click on the chart, or <kbd>F</kbd>. Candles and 13 other chart types, open, high, low, close and volume for any bar, a volume pane, zoom and pan, moving averages, Bollinger bands, VWAP, and lines and notes you draw yourself.</p></div>
        <div class="card rv d1"><h3>A forecast with honest odds</h3><p>A cone of where the price could go, the chance it ends higher, and how the same method did on that chart's past. Support, resistance, crossovers and volume spikes are marked for you.</p></div>
        <div class="card rv d2"><h3>Ask Claude</h3><p>Add your own Anthropic API key and Claude reads the chart, gives its outlook and pins notes on it. Off until you add a key.</p></div>
      </div>
    </div>
  </section>
  <section class="blk" id="window">
    <div class="wrap">
      <div class="blk-head"><div><p class="eyebrow rv">05 · The window</p><h2 class="rv d1">Small, quick, <em>quiet.</em></h2></div></div>
      <div class="cards">
        <div class="card rv"><h3>Its own title bar</h3><p>The gold wordmark, search and Windows' own minimize, maximize and close, in one slim bar.</p></div>
        <div class="card rv d1"><h3>Live status</h3><p>A dot that pulses while prices are live, and says when the market is closed or you're offline.</p></div>
        <div class="card rv d2"><h3>Gentle on your PC</h3><p>Updates every 3 seconds while the market is open, every 30 when it's closed, and less when gilt is minimized. All adjustable.</p></div>
        <div class="card rv wide"><h3>Settings for everything</h3><p>Dark, light or system theme, colour-blind-friendly gain and loss colours, motion, density, default order types, simulated commission and slippage, backups and more.</p></div>
        <div class="card rv d1"><h3>No news or ads</h3><p>Left out on purpose. The only pop-up is a small note when an order fills, and you can turn it off.</p></div>
      </div>
    </div>
  </section>
  <section class="blk tint" id="privacy">
    <div class="wrap">
      <div class="blk-head"><div><p class="eyebrow rv">06 · Your data</p><h2 class="rv d1">Yours, <em>on your PC.</em></h2></div></div>
      <div class="cards">
        <div class="card rv"><h3>Saved locally</h3><p>Your paper account, orders and watchlist live in the app's storage on this computer.</p></div>
        <div class="card rv d1"><h3>No account</h3><p>No sign-up, no email, no servers of ours. Prices come straight from Yahoo Finance to your PC. Ask Claude, if you use it, sends only the chart to Anthropic with your own key.</p></div>
        <div class="card rv d2"><h3>No tracking</h3><p>No analytics or telemetry. gilt doesn't know who you are.</p></div>
      </div>
    </div>
  </section>

  <section class="blk flush" style="padding-top:clamp(120px,14vw,200px)">
    <div class="wrap close">
      <h2 class="rv">Your first trade is <em>a minute away.</em></h2>
      <p class="lede rv d1">Free for Windows 10 and 11, 64-bit.</p>
      <div class="cta rv d2">""" + DL + """</div>
    </div>
  </section>"""

DOWNLOAD = f"""  <section class="hero">
    <div class="wrap">
      <div class="hero-grid">
        <div><p class="eyebrow in">Download</p><h1 class="in d1" style="margin-top:22px">Get gilt <em>for Windows.</em></h1></div>
        <div class="hero-side"><p class="lede in d2">Free, with no account. Install it, choose your starting cash, and make your first trade.</p></div>
      </div>
      <div class="card flat dl-card in d3" style="margin-top:72px">
        <div style="display:flex;flex-direction:column;gap:20px;align-items:flex-start;min-width:0">
          <p class="eyebrow">gilt {VERSION} · Windows 10 · 11 · 64-bit</p>
          <h2>The Windows installer</h2>
          <div class="price">Free</div>
          <div class="cta">{DL.replace("Download for Windows", "Download gilt for Windows")}</div>
          <p class="fine">gilt_{VERSION}_x64-setup.exe · {SIZE} · Windows 10 and 11, 64-bit</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
          <p class="note"><strong>If Windows shows a SmartScreen notice:</strong> the installer isn't code-signed yet, so Windows may say it protected your PC. Click <strong>More info</strong>, then <strong>Run anyway</strong>.</p>
          <ul class="incl"><li><span><strong>After you open it:</strong> <span class="mute">choose how much pretend cash to start with, then press <kbd>Ctrl K</kbd> and search a stock to buy.</span></span></li><li><span><strong>Coming from gilt 0.1:</strong> <span class="mute">your Practice portfolio and watchlist carry over into the new paper account.</span></span></li></ul>
        </div>
      </div>
    </div>
  </section>

  <section class="blk">
    <div class="wrap">
      <div class="blk-head"><div><p class="eyebrow rv">Requirements</p><h2 class="rv d1">What you'll <em>need.</em></h2></div></div>
      <dl class="specgrid rv">
        <div><dt>System</dt><dd>Windows<small>10 or 11, 64-bit</small></dd></div>
        <div><dt>Download</dt><dd>{SIZE}<small>about 10 MB installed</small></dd></div>
        <div><dt>Internet</dt><dd>Yes<small>for live prices</small></dd></div>
        <div><dt>Price</dt><dd>Free</dd></div>
      </dl>
    </div>
  </section>

  <section class="blk tint">
    <div class="wrap split">
      <div class="blk-head"><div><p class="eyebrow rv">Before you start</p><h2 class="rv d1">Installing <em>gilt.</em></h2></div></div>
      <div class="faq rv">
        <details><summary>Do I need anything else?</summary><p>gilt uses Microsoft Edge WebView2, which Windows 11 already has. On Windows 10 the installer adds it if it's missing.</p></details>
        <details><summary>Where is my data kept?</summary><p>In gilt's app storage on your PC. Uninstalling gilt removes it.</p></details>
        <details><summary>How do I update?</summary><p>Download the newest installer from this page and run it. Your account and watchlist stay as they are.</p></details>
      </div>
    </div>
  </section>"""

NOT_FOUND = """  <section class="hero" style="padding-bottom:clamp(96px,12vw,160px)">
    <div class="wrap">
      <div class="hero-grid">
        <div><p class="eyebrow in">404 · Order rejected</p><h1 class="in d1" style="margin-top:22px">This page <em>isn't trading.</em></h1></div>
        <div class="hero-side">
          <p class="lede in d2">The link may be old, or the page may have moved. The market's still open on the home page.</p>
          <div class="cta in d3"><a class="pill acc" href="index.html">Back home <span class="ar">→</span></a><a class="pill" href="download.html">Download</a></div>
        </div>
      </div>
    </div>
  </section>"""

PAGES = {
    "index.html": ("home", "gilt · Paper trading on live prices", HOME, '\n<script src="assets/gilt.js?v=2" defer></script>'),
    "features.html": ("features", "Features · gilt", FEATURES, ""),
    "download.html": ("download", "Download · gilt", DOWNLOAD, ""),
    "404.html": ("", "Page not found · gilt", NOT_FOUND, ""),
}

if __name__ == "__main__":
    for name, (key, title, body, js) in PAGES.items():
        open(os.path.join(SITE, name), "w", encoding="utf-8", newline="\n").write(shell(key, title, body, js))
    print("wrote", ", ".join(PAGES), "· installer", SIZE)
