# 🔮 Cosmic Oracle — GenLayer dApp

## Step 1 — Deploy the contract in GenLayer Studio

1. Go to https://studio.genlayer.com
2. Create a new contract file → paste the contents of `contract.py`
3. Click **Deploy**
4. Copy the contract address shown (e.g. `0xABC...123`)
5. Open `app/page.tsx` and replace `0xYOUR_CONTRACT_ADDRESS_HERE` with your address

## Step 2 — Push to GitHub

Upload all files to a new GitHub repo (same structure as this folder).

## Step 3 — Deploy to Vercel

1. Go to https://vercel.com → New Project → Import your GitHub repo
2. Framework: **Next.js**
3. Root Directory: set to `oracle` if files are in a subfolder
4. Click **Deploy**

## Speed optimisations in this project

- `leaderOnly: true` in writeContract — skips full multi-validator consensus, ~2–3× faster
- `prompt_non_comparative` in contract — validators judge independently (no exact string match needed)  
- Polls `get_total` every 4s instead of waiting for FINALIZED receipt
- Short, focused prompt — less tokens = faster LLM response
