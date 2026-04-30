use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Deserialize)]
struct WebSearchResponse {
    results: Option<Vec<SearchResult>>,
    formatted: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SearchResult {
    title: String,
    snippet: String,
    link: String,
}

pub struct WebSearchClient {
    base_url: String,
}

impl WebSearchClient {
    pub fn new() -> Result<Self> {
        let base_url = env::var("WEB_SEARCH_URL")
            .unwrap_or_else(|_| "https://jimmy-ai-assistant.vercel.app".to_string());
        
        Ok(Self { base_url })
    }

    pub async fn search(&self, query: &str) -> Result<String> {
        let url = format!("{}/api/web-search", self.base_url);
        
        let client = reqwest::Client::new();
        let response = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({ "query": query, "num": 5 }))
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow!("Web search API error: {}", error_text));
        }

        let search_response: WebSearchResponse = response.json().await?;
        
        if let Some(formatted) = search_response.formatted {
            Ok(formatted)
        } else {
            Ok("No results found.".to_string())
        }
    }
}
