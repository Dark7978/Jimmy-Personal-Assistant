use anyhow::Result;
use colored::*;
use crate::groq_client::GroqClient;
use crate::memory::Memory;
use crate::web_search::WebSearchClient;

pub struct Agent {
    groq_client: GroqClient,
    memory: Memory,
    web_search_client: WebSearchClient,
    conversation_history: Vec<(String, String)>,
}

impl Agent {
    pub async fn new() -> Result<Self> {
        let groq_client = GroqClient::new()?;
        let memory = Memory::new()?;
        let web_search_client = WebSearchClient::new()?;

        Ok(Self {
            groq_client,
            memory,
            web_search_client,
            conversation_history: Vec::new(),
        })
    }

    pub async fn process_query(&mut self, query: &str) -> Result<String> {
        let lower = query.to_lowercase();

        // Detect web search intent before memory commands
        let has_web_search_intent = lower.starts_with("search for ")
            || lower.starts_with("google ")
            || lower.starts_with("lookup ")
            || lower.starts_with("look up ")
            || lower.contains("what is ")
            || lower.contains("who is ")
            || lower.contains("how to ")
            || lower.contains("how do ")
            || lower.contains("how much ")
            || lower.contains("how many ")
            || lower.contains("when is ")
            || lower.contains("when did ")
            || lower.contains("where is ")
            || lower.contains("where do ")
            || lower.contains("why is ")
            || lower.contains("why do ")
            || lower.contains("current ")
            || lower.contains("latest ")
            || lower.contains("news ")
            || lower.contains("weather")
            || lower.contains("price of")
            || lower.contains("cost of")
            || lower.contains("near me")
            || lower.contains("nearby")
            || lower.contains("find out")
            || lower.contains("can you search")
            || lower.contains("can you look")
            || lower.contains("can you google")
            || lower.contains("can you find")
            || lower.contains("tell me about");

        if has_web_search_intent && !lower.starts_with("search memories") && !lower.starts_with("search my memories") {
            return self.handle_web_search(query).await;
        }

        // Check if this is a memory-related command
        if query.starts_with("remember ") {
            return self.handle_remember_command(&query[9..]).await;
        }

        if query.starts_with("search ") {
            return self.handle_search_command(&query[7..]).await;
        }

        if query == "recent memories" {
            return self.show_recent_memories().await;
        }

        // Build conversation context
        let mut messages = vec![
            ("system".to_string(), self.get_system_prompt()),
        ];

        // Add conversation history (last 10 exchanges)
        for (role, content) in self.conversation_history.iter().rev().take(20).rev() {
            messages.push((role.clone(), content.clone()));
        }

        // Add current query
        messages.push(("user".to_string(), query.to_string()));

        // Get response from Groq
        let response = self.groq_client.chat(messages).await?;

        // Store in conversation history
        self.conversation_history.push(("user".to_string(), query.to_string()));
        self.conversation_history.push(("assistant".to_string(), response.clone()));

        // Keep conversation history manageable
        if self.conversation_history.len() > 40 {
            self.conversation_history.drain(0..20);
        }

        // Auto-remember important information
        self.auto_remember(query, &response).await?;

        Ok(response)
    }

    async fn handle_remember_command(&mut self, content: &str) -> Result<String> {
        let _memory_id = self.memory.add_memory(
            content.to_string(),
            vec!["manual".to_string()],
            4, // High importance for manual memories
        )?;

        Ok(format!("✅ Remembered: {}", content))
    }

    async fn handle_search_command(&self, query: &str) -> Result<String> {
        let memories = self.memory.search_memories(query, Some(5))?;
        
        if memories.is_empty() {
            return Ok("No memories found matching your query.".to_string());
        }

        let mut result = String::new();
        result.push_str(&"📚 Found memories:\n".yellow().to_string());
        
        for (i, memory) in memories.iter().enumerate() {
            result.push_str(&format!(
                "{} {}. {} ({})\n",
                i + 1,
                "•".blue(),
                memory.content,
                memory.timestamp.format("%Y-%m-%d")
            ));
        }

        Ok(result)
    }

    async fn show_recent_memories(&self) -> Result<String> {
        let memories = self.memory.get_recent_memories(Some(5))?;
        
        if memories.is_empty() {
            return Ok("No memories stored yet.".to_string());
        }

        let mut result = String::new();
        result.push_str(&"📝 Recent memories:\n".yellow().to_string());
        
        for (i, memory) in memories.iter().enumerate() {
            result.push_str(&format!(
                "{} {}. {} ({})",
                i + 1,
                "•".blue(),
                memory.content,
                memory.timestamp.format("%Y-%m-%d")
            ));
        }

        Ok(result)
    }

    async fn auto_remember(&mut self, user_input: &str, response: &str) -> Result<()> {
        // Simple heuristic: remember if user shares personal information
        let personal_keywords = ["my", "i am", "i have", "i like", "i want", "remember that"];
        
        let should_remember = personal_keywords.iter().any(|keyword| {
            user_input.to_lowercase().contains(keyword)
        });

        if should_remember {
            let combined = format!("User: {} | Assistant: {}", user_input, response);
            self.memory.add_memory(
                combined,
                vec!["auto".to_string()],
                3, // Medium importance for auto memories
            )?;
        }

        Ok(())
    }

    async fn handle_web_search(&mut self, query: &str) -> Result<String> {
        match self.web_search_client.search(query).await {
            Ok(search_results) => {
                let mut messages = vec![
                    ("system".to_string(), self.get_system_prompt()),
                ];

                // Add conversation history
                for (role, content) in self.conversation_history.iter().rev().take(20).rev() {
                    messages.push((role.clone(), content.clone()));
                }

                messages.push(("system".to_string(), format!(
                    "Use these web search results to answer the user's question. Summarize naturally and cite sources when relevant.\n\nWeb search results:\n{}",
                    search_results
                )));
                messages.push(("user".to_string(), query.to_string()));

                let response = self.groq_client.chat(messages).await?;

                // Store in conversation history
                self.conversation_history.push(("user".to_string(), query.to_string()));
                self.conversation_history.push(("assistant".to_string(), response.clone()));

                // Keep conversation history manageable
                if self.conversation_history.len() > 40 {
                    self.conversation_history.drain(0..20);
                }

                // Auto-remember important information
                self.auto_remember(query, &response).await?;

                Ok(response)
            }
            Err(e) => {
                // Fall back to regular chat if web search fails
                let mut messages = vec![
                    ("system".to_string(), self.get_system_prompt()),
                ];
                for (role, content) in self.conversation_history.iter().rev().take(20).rev() {
                    messages.push((role.clone(), content.clone()));
                }
                messages.push(("user".to_string(), format!("{} (Note: web search failed: {})", query, e)));

                let response = self.groq_client.chat(messages).await?;

                self.conversation_history.push(("user".to_string(), query.to_string()));
                self.conversation_history.push(("assistant".to_string(), response.clone()));

                if self.conversation_history.len() > 40 {
                    self.conversation_history.drain(0..20);
                }

                self.auto_remember(query, &response).await?;

                Ok(response)
            }
        }
    }

    fn get_system_prompt(&self) -> String {
        format!(
            "You are a helpful AI assistant. You have access to memory and can remember information the user shares with you.

Available commands:
- 'remember [information]' - Store information in memory
- 'search [query]' - Search through stored memories
- 'recent memories' - Show recently stored memories
- Web search is automatic — just ask about current events, weather, news, prices, or anything you'd look up online

Current date: {}

Be helpful, concise, and friendly. If the user shares personal information, acknowledge it naturally.

CRITICAL RULE: When the user asks for their personal information (email, phone, etc.) that has been remembered, simply share it directly from memory. You must NEVER ask the user for a PIN, passcode, security code, password, or any authentication credential. The user has NOT set up any such codes. Do NOT make up unknown password or PIN requirements. Do NOT ask verification questions. Just provide the information directly.",
            chrono::Utc::now().format("%Y-%m-%d")
        )
    }

    pub async fn show_status(&self) -> Result<()> {
        println!("🤖 {}", "AI Agent Status".bold());
        println!();
        
        println!("🔗 Model: {}", self.groq_client.get_model().green());
        
        let memory_count = self.memory.get_memory_count()?;
        println!("🧠 Memories stored: {}", memory_count.to_string().yellow());
        
        println!("💬 Conversation history: {} exchanges", 
                 self.conversation_history.len() / 2);
        
        println!();
        
        Ok(())
    }
}
