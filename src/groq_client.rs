use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Serialize)]
struct GroqRequest {
    model: String,
    messages: Vec<GroqMessage>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GroqMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct GroqResponse {
    choices: Vec<GroqChoice>,
    usage: GroqUsage,
}

#[derive(Debug, Deserialize)]
struct GroqChoice {
    message: GroqMessage,
}

#[derive(Debug, Deserialize)]
struct GroqUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[derive(Clone)]
pub struct GroqClient {
    api_key: String,
    base_url: String,
    model: String,
}

impl GroqClient {
    pub fn new() -> Result<Self> {
        let api_key = env::var("GROQ_API_KEY")
            .map_err(|_| anyhow!("GROQ_API_KEY not found in environment variables"))?;

        Ok(Self {
            api_key,
            base_url: "https://api.groq.com/openai/v1".to_string(),
            model: env::var("DEFAULT_MODEL").unwrap_or_else(|_| "llama-3.1-8b-instant".to_string())
            .replace("mixtral-8x7b-32768", "llama-3.1-8b-instant"), // Auto-fix deprecated model
        })
    }

    pub async fn chat(&self, messages: Vec<(String, String)>) -> Result<String> {
        let groq_messages: Vec<GroqMessage> = messages
            .into_iter()
            .map(|(role, content)| GroqMessage { role, content })
            .collect();

        let request = GroqRequest {
            model: self.model.clone(),
            messages: groq_messages,
            max_tokens: Some(4096),
            temperature: Some(0.7),
        };

        let client = reqwest::Client::new();
        let response = client
            .post(&format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow!("Groq API error: {}", error_text));
        }

        let groq_response: GroqResponse = response.json().await?;
        
        if groq_response.choices.is_empty() {
            return Err(anyhow!("No response from Groq API"));
        }

        Ok(groq_response.choices[0].message.content.clone())
    }

    pub async fn simple_chat(&self, user_message: &str) -> Result<String> {
        let messages = vec![
            ("system".to_string(), "You are a helpful AI assistant.".to_string()),
            ("user".to_string(), user_message.to_string()),
        ];

        self.chat(messages).await
    }

    pub fn get_model(&self) -> &str {
        &self.model
    }
}
