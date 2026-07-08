# Project: Sales Condition POC (Rebate Extraction)

## Stack
- Backend: FastAPI + SQLAlchemy + SQLite (local file: sales_condition_poc.db)
- Extraction: Google Gemini (gemini-2.5-flash) via google-genai SDK — NOT Azure OpenAI
- Frontend: Angular

## Hard rules
1. NEVER modify services/llm_extractor.py unless explicitly asked. This file
   contains verified, tested LLM extraction logic. If you think it needs
   changes, ask first and explain why.
2. When fixing a bug, make the SMALLEST possible change. Do not refactor,
   "improve," rename variables, or touch files unrelated to the specific
   bug described. If you notice something else worth fixing, mention it,
   don't fix it unprompted.
3. After any fix, show the actual diff or exact printed output — do not
   say "fixed" or "all tests passed" without evidence. If asked to debug,
   add print statements and show raw values, not a summary of results.
4. Never silently invent fallback values (rates, IDs, default rules) when
   real data is missing — return null/skip instead, and say you did so.
5. Do not create new scratch/debug scripts unless asked. If you do, name
   them clearly (test_*.py, debug_*.py) so they're easy to find and delete.
6. Before editing any file, state which file(s) you intend to touch and
   why. If your fix ends up touching more files than that, stop and ask
   before proceeding.