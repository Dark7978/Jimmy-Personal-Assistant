use anyhow::Result;
use chrono::{DateTime, Utc};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: String,
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub tags: Vec<String>,
    pub importance: i32, // 1-5 scale
}

use std::sync::{Arc, Mutex};

pub struct Memory {
    db: Arc<Mutex<Connection>>,
}

impl Clone for Memory {
    fn clone(&self) -> Self {
        Self {
            db: Arc::clone(&self.db),
        }
    }
}

impl Memory {
    pub fn new() -> Result<Self> {
        let db_path = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".ai_agent")
            .join("memory.db");

        // Create directory if it doesn't exist
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let db = Connection::open(db_path)?;

        // Create tables
        db.execute(
            "CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                tags TEXT, -- JSON array
                importance INTEGER DEFAULT 3
            )",
            [],
        )?;

        Ok(Self { 
            db: Arc::new(Mutex::new(db))
        })
    }

    pub fn add_memory(&mut self, content: String, tags: Vec<String>, importance: i32) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        let timestamp = Utc::now();
        let tags_json = serde_json::to_string(&tags)?;

        let db = self.db.lock().unwrap();
        db.execute(
            "INSERT INTO memories (id, content, timestamp, tags, importance) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, content, timestamp.to_rfc3339(), tags_json, importance],
        )?;

        Ok(id)
    }

    pub fn search_memories(&self, query: &str, limit: Option<i32>) -> Result<Vec<MemoryEntry>> {
        let limit = limit.unwrap_or(10);
        let pattern = format!("%{}%", query);

        let db = self.db.lock().unwrap();
        let mut stmt = db.prepare(
            "SELECT id, content, timestamp, tags, importance 
             FROM memories 
             WHERE content LIKE ?1 
             ORDER BY importance DESC, timestamp DESC 
             LIMIT ?2",
        )?;

        let rows = stmt.query_map(params![pattern, limit], |row| {
            let tags_json: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

            Ok(MemoryEntry {
                id: row.get(0)?,
                content: row.get(1)?,
                timestamp: DateTime::parse_from_rfc3339(&row.get::<_, String>(2)?)
                    .unwrap()
                    .with_timezone(&Utc),
                tags,
                importance: row.get(4)?,
            })
        })?;

        let mut memories = Vec::new();
        for row in rows {
            memories.push(row?);
        }

        Ok(memories)
    }

    pub fn get_recent_memories(&self, limit: Option<i32>) -> Result<Vec<MemoryEntry>> {
        let limit = limit.unwrap_or(5);

        let db = self.db.lock().unwrap();
        let mut stmt = db.prepare(
            "SELECT id, content, timestamp, tags, importance 
             FROM memories 
             ORDER BY timestamp DESC 
             LIMIT ?1",
        )?;

        let rows = stmt.query_map(params![limit], |row| {
            let tags_json: String = row.get(3)?;
            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();

            Ok(MemoryEntry {
                id: row.get(0)?,
                content: row.get(1)?,
                timestamp: DateTime::parse_from_rfc3339(&row.get::<_, String>(2)?)
                    .unwrap()
                    .with_timezone(&Utc),
                tags,
                importance: row.get(4)?,
            })
        })?;

        let mut memories = Vec::new();
        for row in rows {
            memories.push(row?);
        }

        Ok(memories)
    }

    pub fn delete_memory(&mut self, id: &str) -> Result<bool> {
        let db = self.db.lock().unwrap();
        let rows_affected = db.execute("DELETE FROM memories WHERE id = ?1", params![id])?;
        Ok(rows_affected > 0)
    }

    pub fn get_memory_count(&self) -> Result<i64> {
        let db = self.db.lock().unwrap();
        let count: i64 = db.query_row("SELECT COUNT(*) FROM memories", [], |row| {
            row.get(0)
        })?;
        Ok(count)
    }
}
