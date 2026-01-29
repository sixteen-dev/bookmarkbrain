// DOM Elements
const noApiKeySection = document.getElementById('no-api-key');
const mainContent = document.getElementById('main-content');
const progressSection = document.getElementById('progress-section');
const doneSection = document.getElementById('done-section');
const errorSection = document.getElementById('error-section');

const bookmarkCount = document.getElementById('bookmark-count');
const folderCount = document.getElementById('folder-count');
const validateUrls = document.getElementById('validate-urls');
const maxFolders = document.getElementById('max-folders');
const organizeBtn = document.getElementById('organize-btn');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const errorMessage = document.getElementById('error-message');
const doneMessage = document.getElementById('done-message');

let progressInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Always attach these event listeners
  document.getElementById('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  organizeBtn.addEventListener('click', startOrganization);
  document.getElementById('retry-btn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'resetProgress' });
    showSection('main-content');
  });
  document.getElementById('settings-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('cancel-progress-btn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'cancel' });
  });

  // Check if already running
  const progress = await chrome.runtime.sendMessage({ action: 'getProgress' });
  if (progress.running) {
    showSection('progress-section');
    startProgressPolling();
    return;
  }

  // Check for API key
  const { apiKey } = await chrome.storage.sync.get('apiKey');

  if (!apiKey) {
    showSection('no-api-key');
    return;
  }

  // Load bookmark stats
  await loadStats();
  showSection('main-content');
}

async function loadStats() {
  const tree = await chrome.bookmarks.getTree();
  // Only count from Bookmarks Bar, not Other Bookmarks (which has backups)
  const bookmarkBar = tree[0].children.find(c => c.id === '1' || c.title === 'Bookmarks Bar' || c.title === 'Bookmarks bar');
  if (bookmarkBar) {
    const stats = countBookmarks(bookmarkBar);
    bookmarkCount.textContent = stats.urls;
    folderCount.textContent = stats.folders;
  } else {
    bookmarkCount.textContent = '0';
    folderCount.textContent = '0';
  }
}

function countBookmarks(node) {
  let urls = 0;
  let folders = 0;

  if (node.url) {
    urls = 1;
  } else if (node.children) {
    if (node.title) folders = 1;
    for (const child of node.children) {
      const childStats = countBookmarks(child);
      urls += childStats.urls;
      folders += childStats.folders;
    }
  }

  return { urls, folders };
}

function showSection(sectionId) {
  const sections = ['no-api-key', 'main-content', 'progress-section', 'done-section', 'error-section'];
  sections.forEach(id => {
    document.getElementById(id).classList.toggle('hidden', id !== sectionId);
  });
}

function updateProgress(percent, text) {
  progressFill.style.width = `${percent}%`;
  progressText.textContent = text;
}

async function startOrganization() {
  showSection('progress-section');
  updateProgress(0, 'Starting...');

  const { apiKey } = await chrome.storage.sync.get('apiKey');
  const maxFoldersValue = maxFolders.value ? parseInt(maxFolders.value) : null;

  // Start organization in background
  await chrome.runtime.sendMessage({
    action: 'organizeAll',
    apiKey: apiKey,
    maxFolders: maxFoldersValue,
    validateUrls: validateUrls.checked
  });

  // Start polling for progress
  startProgressPolling();
}

function startProgressPolling() {
  if (progressInterval) {
    clearInterval(progressInterval);
  }

  progressInterval = setInterval(async () => {
    const progress = await chrome.runtime.sendMessage({ action: 'getProgress' });

    updateProgress(progress.percent, progress.text);

    if (progress.cancelled) {
      clearInterval(progressInterval);
      await chrome.runtime.sendMessage({ action: 'resetProgress' });
      showSection('main-content');
    } else if (progress.error) {
      clearInterval(progressInterval);
      errorMessage.textContent = progress.error;
      showSection('error-section');
    } else if (progress.done) {
      clearInterval(progressInterval);
      const result = progress.result || {};
      doneMessage.textContent = `Organized ${result.organized || 0} bookmarks into ${result.folders || 0} folders.${result.dead ? ` Found ${result.dead} dead links.` : ''}`;
      showSection('done-section');
    }
  }, 500);
}
