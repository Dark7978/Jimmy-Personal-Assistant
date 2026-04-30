// User profile endpoint - reads and returns user profile information
// This provides context to the AI about the user

import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Try to read the user profile from the project root
    const profilePath = path.join(process.cwd(), '..', 'user-profile.md');
    
    let profileContent = '';
    try {
      profileContent = fs.readFileSync(profilePath, 'utf-8');
    } catch (e) {
      // If file doesn't exist, return default info
      profileContent = '# User Profile\n\nNo profile information available yet. Please create user-profile.md in the project root.';
    }

    return res.status(200).json({ 
      profile: profileContent,
      exists: fs.existsSync(profilePath)
    });

  } catch (err) {
    console.error('user-profile error:', err);
    return res.status(500).json({ error: err.message });
  }
}
