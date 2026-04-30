use clap::{Parser, Subcommand};
use colored::*;
use std::io::{self, Write};

mod agent;
mod groq_client;
mod memory;
mod vapi_server;
mod web_search;

use agent::Agent;
use vapi_server::VapiServer;

#[derive(Parser)]
#[command(name = "ai-agent")]
#[command(about = "A personal AI assistant built with Rust")]
#[command(version = "0.1.0")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Start interactive chat mode
    Chat,
    /// Process a single command
    Ask {
        /// The question or command to process
        query: String,
    },
    /// Show agent status
    Status,
    /// Start Vapi webhook server for voice calls
    Server {
        /// Port to run the server on (default: 8080)
        #[arg(short, long, default_value = "8080")]
        port: u16,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load environment variables
    dotenv::dotenv().ok();

    let cli = Cli::parse();

    // Initialize agent
    let mut agent = Agent::new().await?;

    match cli.command {
        Some(Commands::Chat) => {
            start_chat_mode(&mut agent).await?;
        }
        Some(Commands::Ask { query }) => {
            let response = agent.process_query(&query).await?;
            println!("{}", response.green());
        }
        Some(Commands::Status) => {
            agent.show_status().await?;
        }
        Some(Commands::Server { port }) => {
            let groq_client = crate::groq_client::GroqClient::new()?;
            let vapi_server = VapiServer::new(groq_client)?;
            vapi_server.start(port).await?;
        }
        None => {
            // Default to chat mode
            start_chat_mode(&mut agent).await?;
        }
    }

    Ok(())
}

async fn start_chat_mode(agent: &mut Agent) -> anyhow::Result<()> {
    println!("🤖 AI Agent - Chat Mode");
    println!("Type 'exit' or 'quit' to end the conversation");
    println!("Type 'help' for available commands");
    println!();

    loop {
        print!("{} ", "You:".blue().bold());
        io::stdout().flush()?;

        let mut input = String::new();
        io::stdin().read_line(&mut input)?;
        let input = input.trim();

        match input {
            "exit" | "quit" => {
                println!("👋 Goodbye!");
                break;
            }
            "help" => {
                print_help();
            }
            "clear" => {
                // Clear screen (platform specific)
                print!("\x1B[2J\x1B[1;1H");
            }
            "status" => {
                agent.show_status().await?;
            }
            _ if !input.is_empty() => {
                print!("{} ", "Agent:".yellow().bold());
                io::stdout().flush()?;

                match agent.process_query(input).await {
                    Ok(response) => {
                        println!("{}", response.green());
                    }
                    Err(e) => {
                        println!("{} {}", "Error:".red(), e);
                    }
                }
            }
            _ => {}
        }

        println!();
    }

    Ok(())
}

fn print_help() {
    println!("Available commands:");
    println!("  help   - Show this help message");
    println!("  status - Show agent status and configuration");
    println!("  clear  - Clear the screen");
    println!("  exit   - Exit the chat");
    println!("  quit   - Exit the chat");
    println!();
    println!("Web search is automatic — just ask about current events, weather, news, prices, etc.");
    println!("Memory commands:");
    println!("  remember [info]    - Save something to memory");
    println!("  search [query]     - Search your stored memories");
    println!("  recent memories    - Show recently saved memories");
    println!();
}
