use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use warp::{Filter, Reply};
use crate::groq_client::GroqClient;

#[derive(Debug, Deserialize)]
pub struct VapiMessage {
    pub message: VapiMessageContent,
}

#[derive(Debug, Deserialize)]
pub struct VapiMessageContent {
    #[serde(rename = "type")]
    pub message_type: String,
    pub call: Option<VapiCall>,
    pub transcript: Option<String>,
    pub messages: Option<Vec<VapiChatMessage>>,
}

#[derive(Debug, Deserialize)]
pub struct VapiCall {
    pub id: String,
    #[serde(rename = "phoneNumber")]
    pub phone_number: Option<String>,
    pub customer: Option<VapiCustomer>,
}

#[derive(Debug, Deserialize)]
pub struct VapiCustomer {
    pub number: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct VapiChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct VapiResponse {
    pub assistant: Option<VapiAssistant>,
    pub messages: Option<Vec<VapiChatMessage>>,
}

#[derive(Debug, Serialize)]
pub struct VapiAssistant {
    pub first_message: Option<String>,
    pub model: VapiModel,
    pub voice: VapiVoice,
}

#[derive(Debug, Serialize)]
pub struct VapiModel {
    pub provider: String,
    pub model: String,
    pub messages: Vec<VapiChatMessage>,
}

#[derive(Debug, Serialize)]
pub struct VapiVoice {
    pub provider: String,
    pub voice_id: String,
}

pub struct VapiServer {
    groq_client: Arc<GroqClient>,
}

impl VapiServer {
    pub fn new(groq_client: GroqClient) -> Self {
        Self { 
            groq_client: Arc::new(groq_client)
        }
    }

    pub async fn start(&self, port: u16) -> Result<()> {
        let groq_client = self.groq_client.clone();
        
        // POST /webhook endpoint for Vapi
        let webhook = warp::path("webhook")
            .and(warp::post())
            .and(warp::body::json())
            .and(warp::any().map(move || groq_client.clone()))
            .and_then(handle_vapi_webhook);

        // Health check endpoint
        let health = warp::path("health")
            .and(warp::get())
            .map(|| {
                warp::reply::json(&serde_json::json!({
                    "status": "healthy",
                    "service": "vapi-webhook"
                }))
            });

        let routes = webhook.or(health);

        println!("🚀 Vapi webhook server starting on port {}", port);
        println!("📞 Configure your Vapi phone number to send webhooks to:");
        println!("   http://localhost:{}/webhook", port);

        warp::serve(routes)
            .run(([0, 0, 0, 0], port))
            .await;

        Ok(())
    }
}

async fn handle_vapi_webhook(
    message: VapiMessage,
    groq_client: Arc<GroqClient>,
) -> Result<impl Reply, warp::Rejection> {
    println!("📞 Received Vapi event: {}", message.message.message_type);

    match message.message.message_type.as_str() {
        "assistant-request" => {
            // New call starting - create assistant configuration
            let response = VapiResponse {
                assistant: Some(VapiAssistant {
                    first_message: Some("Hello! I'm your AI assistant. How can I help you today?".to_string()),
                    model: VapiModel {
                        provider: "custom".to_string(),
                        model: "groq-custom".to_string(),
                        messages: vec![],
                    },
                    voice: VapiVoice {
                        provider: "11labs".to_string(),
                        voice_id: "rachel".to_string(),
                    },
                }),
                messages: None,
            };

            Ok(warp::reply::json(&response))
        }
        "function-calls" => {
            // This would handle tool calls, but we'll process speech directly
            Ok(warp::reply::json(&serde_json::json!({})))
        }
        "transcript" => {
            // Process user speech
            if let Some(transcript) = message.message.transcript {
                if !transcript.trim().is_empty() {
                    match process_user_speech(&groq_client, &transcript).await {
                        Ok(response) => {
                            let vapi_response = VapiResponse {
                                assistant: None,
                                messages: Some(vec![VapiChatMessage {
                                    role: "assistant".to_string(),
                                    content: response,
                                }]),
                            };
                            Ok(warp::reply::json(&vapi_response))
                        }
                        Err(e) => {
                            eprintln!("Error processing speech: {}", e);
                            let error_response = VapiResponse {
                                assistant: None,
                                messages: Some(vec![VapiChatMessage {
                                    role: "assistant".to_string(),
                                    content: "I'm sorry, I had trouble processing that. Could you please repeat?".to_string(),
                                }]),
                            };
                            Ok(warp::reply::json(&error_response))
                        }
                    }
                } else {
                    Ok(warp::reply::json(&serde_json::json!({})))
                }
            } else {
                Ok(warp::reply::json(&serde_json::json!({})))
            }
        }
        _ => {
            // Other events we don't need to respond to
            Ok(warp::reply::json(&serde_json::json!({})))
        }
    }
}

async fn process_user_speech(groq_client: &GroqClient, user_input: &str) -> Result<String> {
    // Use the Groq client directly for speech processing
    let messages = vec![
        ("system".to_string(), "You are a helpful AI assistant having a voice conversation. Be concise and natural in your responses. Avoid markdown formatting and special characters that don't work well in speech.".to_string()),
        ("user".to_string(), user_input.to_string()),
    ];

    let response = groq_client.chat(messages).await?;
    
    // Clean up response for voice (remove markdown, etc.)
    let voice_response = response
        .replace("**", "")
        .replace("*", "")
        .replace("```", "")
        .replace("#", "")
        .trim()
        .to_string();

    Ok(voice_response)
}
