'use strict';
// Lightweight CJS stub for @octokit/rest — only needed in test env.
// Real Octokit (ESM-only) is used at runtime via the compiled dist.
class Octokit {
  constructor() {
    this.git = {
      getTree: async () => ({ data: { tree: [] } }),
      getBlob: async () => ({ data: { content: '', encoding: 'utf-8' } }),
    };
  }
}
module.exports = { Octokit };
