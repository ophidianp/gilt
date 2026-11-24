//! Network layer. The webview can't call Yahoo directly (CORS), so the
//! front end asks these commands, which fetch and pass the JSON through as-is.

use reqwest::{Client, Url};
use serde_json::Value;
use std::time::Duration;
use tauri::State;

const BASE: &str = "https://query1.finance.yahoo.com";
const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

struct Http(Client);

/// Tickers look like NVDA, BRK-B, ^GSPC, EURUSD=X. Anything else is refused.
fn valid_symbol(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 20
        && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '^' | '.' | '-' | '='))
}

fn one_of(v: &str, allowed: &[&str]) -> Result<(), String> {
    if allowed.contains(&v) { Ok(()) } else { Err(format!("unsupported value: {v}")) }
}

async fn get_json(client: &Client, url: Url) -> Result<Value, String> {
    let res = client.get(url).send().await.map_err(|e| e.to_string())?;
    let status = res.status();
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    res.json::<Value>().await.map_err(|e| e.to_string())
}

/// Latest price, previous close and an intraday sparkline for up to 20 tickers in one call.
#[tauri::command]
async fn spark(http: State<'_, Http>, symbols: Vec<String>) -> Result<Value, String> {
    if symbols.is_empty() || symbols.len() > 20 || !symbols.iter().all(|s| valid_symbol(s)) {
        return Err("bad symbol list".into());
    }
    let mut url = Url::parse(&format!("{BASE}/v8/finance/spark")).unwrap();
    url.query_pairs_mut()
        .append_pair("symbols", &symbols.join(","))
        .append_pair("range", "1d")
        .append_pair("interval", "5m");
    get_json(&http.0, url).await
}

/// Full price history for one ticker over a range.
#[tauri::command]
async fn chart(http: State<'_, Http>, symbol: String, range: String, interval: String) -> Result<Value, String> {
    if !valid_symbol(&symbol) {
        return Err("bad symbol".into());
    }
    one_of(&range, &["1d", "5d", "1mo", "3mo", "6mo", "ytd", "1y", "2y", "5y", "10y", "max"])?;
    one_of(&interval, &["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"])?;
    let mut url = Url::parse(&format!("{BASE}/v8/finance/chart/")).unwrap();
    url.path_segments_mut().unwrap().pop_if_empty().push(&symbol);
    url.query_pairs_mut().append_pair("range", &range).append_pair("interval", &interval);
    get_json(&http.0, url).await
}

/// Ticker search by name or symbol.
#[tauri::command]
async fn search(http: State<'_, Http>, query: String) -> Result<Value, String> {
    let q = query.trim();
    if q.is_empty() || q.len() > 40 {
        return Err("bad query".into());
    }
    let mut url = Url::parse(&format!("{BASE}/v1/finance/search")).unwrap();
    url.query_pairs_mut()
        .append_pair("q", q)
        .append_pair("quotesCount", "8")
        .append_pair("newsCount", "0")
        .append_pair("listsCount", "0");
    get_json(&http.0, url).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = Client::builder()
        .user_agent(UA)
        .timeout(Duration::from_secs(10))
        .build()
        .expect("http client");
    tauri::Builder::default()
        .manage(Http(client))
        .invoke_handler(tauri::generate_handler![spark, chart, search])
        .run(tauri::generate_context!())
        .expect("error while running gilt");
}
