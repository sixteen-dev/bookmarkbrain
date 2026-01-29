# BookmarkBrain

AI-powered Chrome extension that automatically organizes your bookmarks into smart folders using Google Gemini.

## Features

- **AI Categorization** - Uses Google Gemini to analyze your bookmarks and group them into logical folders
- **Dead Link Detection** - Optionally checks which URLs are still alive (runs 10 checks in parallel)
- **Automatic Backups** - Your old bookmarks are saved to "Other Bookmarks" before reorganizing
- **Short Folder Names** - Creates clean, concise folder names (max 2 words)
- **Customizable** - Set maximum number of folders if desired
- **Free API** - Uses Gemini's free tier (no credit card required)

## Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `BookmarkBrain` folder
6. Click the extension icon and set up your API key

### Get Your API Key

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Click "Create API Key"
3. Copy the key and paste it in BookmarkBrain settings

## Usage

1. Click the BookmarkBrain icon in your toolbar
2. (Optional) Check "Check for dead links" to filter broken URLs
3. (Optional) Set max folders limit
4. Click "Organize My Bookmarks"
5. Wait for AI analysis to complete
6. Your bookmarks are now organized!

## Restoring Backups

Your original bookmarks are automatically backed up before reorganizing:

1. Open Chrome's Bookmark Manager (`Ctrl+Shift+O` or `Cmd+Shift+O`)
2. Navigate to "Other Bookmarks"
3. Find the folder named "Backup YYYY-MM-DD"
4. Drag bookmarks back to your Bookmarks Bar

## Privacy

- Your bookmarks (titles and URLs only) are sent to Google Gemini API for categorization
- Your API key is stored locally in Chrome's secure storage
- No data is collected or stored on any external server
- See [Terms & Privacy](privacy-policy.html) for full details

## Permissions

- `bookmarks` - Read and modify your bookmarks
- `storage` - Store your API key locally
- `host_permissions` - Connect to Gemini API

## Tech Stack

- Chrome Extension Manifest V3
- Google Gemini API (gemini-2.5-flash)
- Vanilla JavaScript

## License

MIT
