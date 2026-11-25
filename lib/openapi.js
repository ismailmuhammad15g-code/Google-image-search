// OpenAPI 3.0 description of the public API (served at /api/openapi).
const imageSchema = {
  type: 'object',
  properties: {
    position: { type: 'integer' }, title: { type: 'string' }, source: { type: 'string', description: 'Site domain' }, source_logo: { type: 'string' },
    link: { type: 'string', description: 'Page the image was found on' }, thumbnail: { type: 'string' }, original: { type: 'string', description: 'Full size image URL' },
    original_width: { type: 'integer' }, original_height: { type: 'integer' },
    score: { type: 'integer', nullable: true, description: '0-100 AI match score (agent only; null in keyword fallback)' },
    why: { type: 'string', description: 'Why the agent chose it (agent only)' }, is_gif: { type: 'boolean', description: 'Agent only' },
  },
};
const p = (name, description, schema = { type: 'string' }, extra = {}) => ({ name, in: 'query', description, schema, ...extra });

export function openapi(origin = '') {
  return {
    openapi: '3.0.3',
    info: { title: 'Lemon Lens Image Search & AI Agent API', version: '2.0.0', description: 'Free, unlimited image search plus an AI agent that understands a description, searches several engines and ranks the best matches.' },
    servers: [{ url: origin || '/' }],
    paths: {
      '/api/search': { get: { summary: 'Image search (SerpApi-style)', operationId: 'searchImages', parameters: [
        p('q', 'Search query', { type: 'string' }, { required: true }), p('ijn', 'Page, starting at 0', { type: 'integer', minimum: 0, maximum: 50 }),
        p('safe', 'Safe search', { type: 'string', enum: ['moderate', 'active', 'off'] }), p('imgsz', 'Size', { type: 'string', enum: ['l', 'm', 'i'] }),
        p('image_type', 'Type', { type: 'string', enum: ['photo', 'clipart', 'lineart', 'animated', 'face'] }), p('image_color', 'Color', { type: 'string', enum: ['color', 'gray'] }),
        p('gl', 'Country code'), p('hl', 'Language code'), p('location', 'See /api/locations'), p('backend', 'Force an engine', { type: 'string', enum: ['auto', 'bing', 'ddg', 'google'] }),
      ], responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { search_metadata: { type: 'object' }, images_results: { type: 'array', items: imageSchema } } } } } }, 400: { description: 'Bad parameter' }, 502: { description: 'Upstream engine failed' } } } },
      '/api/agent': {
        get: { summary: 'AI image agent', description: 'Understands a description, plans searches, searches several pages across engines and ranks candidates. Add stream=true for Server-Sent Events.', operationId: 'agentSearch', parameters: [
          p('q', 'Describe the image in any language', { type: 'string', maxLength: 600 }, { required: true }),
          p('limit', 'Images to return (1-60, default 24)', { type: 'integer', minimum: 1, maximum: 60 }), p('min_score', 'Minimum AI match score 0-100 (default 50)', { type: 'integer' }),
          p('gif', 'Include GIFs', { type: 'boolean' }), p('format', 'Return only this format', { type: 'string', enum: ['any', 'photo', 'gif'] }),
          p('previous', 'Previous request, to refine it ("same but black and white")'), p('safe', 'Safe search', { type: 'string', enum: ['moderate', 'active', 'off'] }),
          p('thinking', 'Include the AI reasoning text', { type: 'boolean' }), p('plan_only', 'Only return the understanding/queries (fast)', { type: 'boolean' }), p('stream', 'Server-Sent Events', { type: 'boolean' }),
        ], responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { agent_metadata: { type: 'object' }, understanding: { type: 'object' }, summary: { type: 'string' }, images_results: { type: 'array', items: imageSchema } } } } } }, 400: { description: 'Bad parameter' } } },
        post: { summary: 'AI image agent (JSON body)', operationId: 'agentSearchPost', requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['q'], properties: { q: { type: 'string' }, limit: { type: 'integer' }, min_score: { type: 'integer' }, gif: { type: 'boolean' }, format: { type: 'string' }, previous: { type: 'string' }, safe: { type: 'string' }, thinking: { type: 'boolean' }, plan_only: { type: 'boolean' }, stream: { type: 'boolean' } } } } } }, responses: { 200: { description: 'Same as GET' } } },
      },
      '/api/locations': { get: { summary: 'List supported locations', operationId: 'locations', parameters: [p('q', 'Filter by name')], responses: { 200: { description: 'OK' } } } },
      '/api/health': { get: { summary: 'Health check', operationId: 'health', responses: { 200: { description: 'OK' } } } },
    },
  };
}
