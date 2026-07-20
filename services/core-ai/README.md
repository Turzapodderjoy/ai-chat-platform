# Core AI

## Purpose

The Core AI is the decision engine of the platform.

It does not generate answers directly.

Instead, it decides:

- Which AI provider should handle the request
- Which workflow should be executed
- Whether memory is required
- Whether a human handoff is needed
- Whether tools should be executed
- Whether web search is required

The Core AI never communicates directly with external providers.

It communicates only through the AI Provider Manager.