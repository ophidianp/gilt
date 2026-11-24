/* Home page: keeps the drawn Portfolio screen in the hero gently moving, the way the app does.
   Sample numbers only; nothing here is fetched. */
(() => {
  const val = document.getElementById("pm-val");
  if (!val) return;
  const chg = document.getElementById("pm-chg"), px = document.getElementById("pm-px");
  const line = document.getElementById("pm-line"), area = document.getElementById("pm-area");
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const START = 10000, SHARES = 5;
  let cash = 10482.16 - SHARES * 153.42, price = 153.42;
  const hist = [];
  // a sample climb from $10,000 to today's value, with some wobble along the way
  for (let i = 0; i <= 60; i++) hist.push(10000 + 482.16 * (i / 60) + (i && i < 60 ? Math.sin(i * 1.7) * 38 + (Math.random() - 0.5) * 30 : 0));
  const usd = (v) => (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const draw = () => {
    const lo = Math.min(...hist), hi = Math.max(...hist), n = hist.length;
    const pts = hist.map((v, i) => `${(i * 400 / (n - 1)).toFixed(1)},${(84 - (v - lo) / (hi - lo || 1) * 78).toFixed(1)}`).join(" ");
    line.setAttribute("points", pts);
    area.setAttribute("points", `${pts} 400,90 0,90`);
  };
  let last = 10482.16;
  const tick = () => {
    price = Math.max(120, price + (Math.random() - 0.45) * 0.6);
    const v = cash + SHARES * price + (Math.random() - 0.4) * 6;
    hist.push(v); if (hist.length > 61) hist.shift();
    val.textContent = usd(v);
    val.classList.remove("fu", "fd"); void val.offsetWidth; val.classList.add(v >= last ? "fu" : "fd");
    setTimeout(() => val.classList.remove("fu", "fd"), 600);
    last = v;
    const d = v - START;
    chg.textContent = `${d >= 0 ? "+" : "−"}${usd(Math.abs(d))} (${d >= 0 ? "+" : "−"}${Math.abs(d / START * 100).toFixed(2)}%) all time`;
    chg.className = "pm-chg " + (d >= 0 ? "up" : "dn");
    px.textContent = usd(price);
    draw();
  };
  draw();
  if (!calm) setInterval(() => { if (!document.hidden) tick(); }, 2400);
})();
