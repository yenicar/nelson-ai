---
title: Nelson AI
emoji: 📊
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
short_description: AI account manager on a synthetic 2,000-customer B2B book
---

# Nelson AI (live demo)

An always-on AI account manager for a B2B portfolio. Nelson reads the customer data, finds the
accounts at risk and drafts the next step; a person approves every action.

- Sign in with the pre-filled demo login.
- All data is synthetic: 2,000 customers across 15 tables.
- Email sending and the Telegram bot are off in this demo.

Code: https://github.com/yenicar/nelson-ai

## Deploying this Space

These two files are the whole Space. Create a new Space with the **Docker** SDK, upload this
`README.md` and the `Dockerfile` next to it, then add two secrets under Settings:

| Secret | Value |
| --- | --- |
| `GEMINI_API_KEY` | a Gemini API key |
| `SESSION_SECRET` | any long random string |

The first build takes a few minutes. A free Space sleeps when idle and wakes on the next visit.
