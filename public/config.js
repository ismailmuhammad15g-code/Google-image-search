// Test configuration. This file is public on purpose (test deployment): the AI agent calls Groq straight from the browser.
// For production move the key to a server-side env var and proxy the request, then rotate this key.
window.APP_CONFIG = {
  GROQ_API_KEY: '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',
  GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
  GROQ_MODEL: 'openai/gpt-oss-120b',
};
