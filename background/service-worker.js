// Using Google Gemini API - free tier available at aistudio.google.com
const MODEL = 'gemini-2.5-flash';

// Store progress for popup to read
let currentProgress = { percent: 0, text: '', running: false, error: null, done: false, cancelled: false };

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'organizeAll') {
    // Run in background - don't wait for response
    runFullOrganization(request.apiKey, request.maxFolders, request.validateUrls);
    sendResponse({ started: true });
    return false;
  }

  if (request.action === 'getProgress') {
    sendResponse(currentProgress);
    return false;
  }

  if (request.action === 'cancel') {
    currentProgress.cancelled = true;
    currentProgress.running = false;
    currentProgress.text = 'Cancelled';
    sendResponse({ ok: true });
    return false;
  }

  if (request.action === 'resetProgress') {
    currentProgress = { percent: 0, text: '', running: false, error: null, done: false, cancelled: false };
    sendResponse({ ok: true });
    return false;
  }
});

function updateProgress(percent, text) {
  currentProgress.percent = percent;
  currentProgress.text = text;
}

async function runFullOrganization(apiKey, maxFolders, validateUrls) {
  currentProgress = { percent: 0, text: 'Starting...', running: true, error: null, done: false, cancelled: false };

  try {
    // Step 1: Get all bookmarks
    updateProgress(5, 'Loading bookmarks...');
    const tree = await chrome.bookmarks.getTree();
    const bookmarkBar = tree[0].children.find(c => c.id === '1' || c.title === 'Bookmarks Bar' || c.title === 'Bookmarks bar');

    if (!bookmarkBar) {
      throw new Error('Could not find bookmarks bar');
    }

    const allBookmarks = extractBookmarks(bookmarkBar);
    updateProgress(10, `Found ${allBookmarks.length} bookmarks`);

    if (allBookmarks.length === 0) {
      throw new Error('No bookmarks found to organize');
    }

    // Step 2: Validate URLs if enabled
    let validBookmarks = [];
    let deadBookmarks = [];

    if (validateUrls) {
      updateProgress(15, 'Checking for dead links...');
      const total = allBookmarks.length;
      let checked = 0;
      const BATCH_SIZE = 10; // Check 10 URLs in parallel

      for (let i = 0; i < allBookmarks.length; i += BATCH_SIZE) {
        if (currentProgress.cancelled) return;

        const batch = allBookmarks.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (bm) => ({
            bm,
            isAlive: await checkUrl(bm.url)
          }))
        );

        for (const { bm, isAlive } of results) {
          if (isAlive) {
            validBookmarks.push(bm);
          } else {
            deadBookmarks.push(bm);
          }
        }

        checked += batch.length;
        updateProgress(15 + (checked / total) * 25, `Checking URLs... ${checked}/${total}`);
      }
      updateProgress(40, `${validBookmarks.length} alive, ${deadBookmarks.length} dead`);
    } else {
      validBookmarks = allBookmarks;
    }

    // Step 3: Categorize with AI
    if (currentProgress.cancelled) return;
    updateProgress(45, 'AI is analyzing your bookmarks...');
    const categories = await categorizeBookmarks(validBookmarks, apiKey, maxFolders);
    updateProgress(70, `Created ${categories.length} categories`);

    // Step 4: Create backup folder in "Other Bookmarks"
    if (currentProgress.cancelled) return;
    updateProgress(75, 'Backing up old bookmarks...');
    const otherBookmarks = tree[0].children.find(c => c.id === '2' || c.title === 'Other Bookmarks' || c.title === 'Other bookmarks');
    const backupFolder = await chrome.bookmarks.create({
      parentId: otherBookmarks ? otherBookmarks.id : '2',
      title: `Backup ${new Date().toISOString().slice(0, 10)}`
    });

    // Move all current bookmark bar items to backup
    const currentItems = await chrome.bookmarks.getChildren(bookmarkBar.id);
    for (const item of currentItems) {
      try {
        await chrome.bookmarks.move(item.id, { parentId: backupFolder.id });
      } catch (e) {
        console.warn('Failed to backup item:', item.title, e);
      }
    }
    updateProgress(80, 'Old bookmarks backed up');

    // Step 5: Create new folders directly on bookmark bar
    if (currentProgress.cancelled) return;
    updateProgress(85, 'Creating new folders...');

    for (const cat of categories) {
      const folder = await chrome.bookmarks.create({
        parentId: bookmarkBar.id,
        title: cat.name
      });

      for (const idx of cat.bookmarks) {
        const bm = validBookmarks[idx];
        if (bm) {
          await chrome.bookmarks.create({
            parentId: folder.id,
            title: bm.title,
            url: bm.url
          });
        }
      }
    }

    // Step 6: Create Dead Links folder if any
    if (deadBookmarks.length > 0) {
      const deadFolder = await chrome.bookmarks.create({
        parentId: bookmarkBar.id,
        title: 'Dead Links'
      });

      for (const bm of deadBookmarks) {
        await chrome.bookmarks.create({
          parentId: deadFolder.id,
          title: bm.title,
          url: bm.url
        });
      }
    }

    updateProgress(100, 'Done!');
    currentProgress.done = true;
    currentProgress.running = false;
    currentProgress.result = {
      organized: validBookmarks.length,
      folders: categories.length,
      dead: deadBookmarks.length
    };

  } catch (error) {
    console.error('Organization failed:', error);
    currentProgress.error = error.message;
    currentProgress.running = false;
  }
}

function extractBookmarks(node) {
  const bookmarks = [];

  if (node.url) {
    bookmarks.push({
      id: node.id,
      title: node.title || 'Untitled',
      url: node.url
    });
  } else if (node.children) {
    for (const child of node.children) {
      bookmarks.push(...extractBookmarks(child));
    }
  }

  return bookmarks;
}

async function checkUrl(url) {
  // Skip obvious dead URLs
  const urlLower = url.toLowerCase();
  if (urlLower.includes('checkout') || urlLower.includes('/cart') || urlLower.includes('/basket') || urlLower.includes('checkoutid=')) {
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal
    });

    clearTimeout(timeout);
    return true; // If no error, assume alive (no-cors can't check status)
  } catch {
    return false;
  }
}

async function categorizeBookmarks(bookmarks, apiKey, maxFolders) {
  const systemPrompt = buildSystemPrompt(maxFolders);
  const userPrompt = buildUserPrompt(bookmarks);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  const jsonContent = extractJson(content);
  const parsed = JSON.parse(jsonContent);

  return parsed.folders.map(f => ({
    name: f.name,
    bookmarks: f.bookmarks
  }));
}

function buildSystemPrompt(maxFolders) {
  const maxFoldersInstruction = maxFolders
    ? `4. Create NO MORE than ${maxFolders} folders. Merge similar topics if needed to stay under this limit.`
    : '4. Create as many folders as makes sense, but prefer fewer well-organized folders over many sparse ones. Aim for 5-15 folders for typical bookmark collections.';

  return `You are a bookmark organizer. You will receive a list of bookmarks with their titles and URLs.

Your task:
1. Analyze the bookmarks and group them into logical folders based on their content/purpose
2. Each folder must have a SHORT name (max 2 words, no special characters)
3. Assign every bookmark to exactly one folder
${maxFoldersInstruction}

Guidelines for folder names:
- Use SHORT names, max 2 words (e.g. "Dev", "Finance", "Shopping", "Travel", "Learning", "Work", "Fun", "Health", "News", "Docs", "Tools", "Social Media", "Food", "Music", "Games", "Code", "Design", "AI", "Crypto")
- Prefer single words when possible, max 2 words when needed
- Group by purpose/topic, not by website

Respond ONLY with valid JSON in this exact format:
{
  "folders": [
    {
      "name": "Folder Name",
      "bookmarks": [0, 5, 12]
    }
  ]
}

The "bookmarks" array contains indices from the input list (0-indexed).
Do not include any explanation or text outside the JSON.
Every bookmark index must appear exactly once across all folders.`;
}

function buildUserPrompt(bookmarks) {
  let prompt = 'Organize these bookmarks:\n\n';

  bookmarks.forEach((bm, idx) => {
    const title = truncate(bm.title, 60);
    const url = truncate(bm.url, 80);
    prompt += `[${idx}] ${title} | ${url}\n`;
  });

  return prompt;
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

function extractJson(content) {
  const trimmed = content.trim();

  if (trimmed.startsWith('```')) {
    const lines = trimmed.split('\n');
    const start = lines.findIndex(l => l.startsWith('```')) + 1;
    const end = lines.slice(start).findIndex(l => l.startsWith('```')) + start;
    if (start < end) {
      return lines.slice(start, end).join('\n');
    }
  }

  if (trimmed.startsWith('{')) {
    return trimmed;
  }

  const startIdx = content.indexOf('{');
  const endIdx = content.lastIndexOf('}');
  if (startIdx !== -1 && endIdx > startIdx) {
    return content.substring(startIdx, endIdx + 1);
  }

  throw new Error('Could not extract JSON from response');
}
