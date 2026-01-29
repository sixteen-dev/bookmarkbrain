const apiKeyInput = document.getElementById('api-key');
const saveBtn = document.getElementById('save-btn');
const testBtn = document.getElementById('test-btn');
const toggleBtn = document.getElementById('toggle-key');
const statusEl = document.getElementById('status');

// Load saved API key
chrome.storage.sync.get('apiKey', ({ apiKey }) => {
  if (apiKey) {
    apiKeyInput.value = apiKey;
  }
});

// Toggle password visibility
toggleBtn.addEventListener('click', () => {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    toggleBtn.textContent = 'Hide key';
  } else {
    apiKeyInput.type = 'password';
    toggleBtn.textContent = 'Show key';
  }
});

// Save API key
saveBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    showStatus('Please enter an API key', 'error');
    return;
  }

  await chrome.storage.sync.set({ apiKey });
  showStatus('Saved!', 'success');
});

// Test API connection
testBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey) {
    showStatus('Please enter an API key first', 'error');
    return;
  }

  showStatus('Testing...', '');

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Say "OK" and nothing else.' }]
          }
        ],
        generationConfig: {
          maxOutputTokens: 10
        }
      })
    });

    if (response.ok) {
      showStatus('Connection successful!', 'success');
    } else {
      const error = await response.json();
      const msg = error.error?.message || `Error: ${response.status}`;
      showStatus(msg, 'error');
      console.error('API error:', error);
    }
  } catch (error) {
    showStatus('Connection failed', 'error');
    console.error('Test failed:', error);
  }
});

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = 'status ' + type;

  if (type === 'success') {
    setTimeout(() => {
      statusEl.textContent = '';
    }, 3000);
  }
}
