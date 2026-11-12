# How to Deploy Royal Ludo Server for Free ($0/month)

You can host this authoritative game server on **Render.com** (or Railway / Fly.io) at **zero cost forever**.

### Step 1: Create a Free Account
1. Go to [https://render.com](https://render.com) and sign up for a free account.

### Step 2: Create a New Web Service
1. Click **New +** ➔ **Web Service**.
2. Connect your GitHub repository containing the `LudoKing_App` code.
3. Configure the following settings:
   - **Root Directory**: `LudoKing_App/server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Instance Type**: **Free ($0/month)**

### Step 3: Copy Your Free WebSocket URL
Once deployed, Render gives you a free HTTPS/WSS URL like:
`wss://royal-ludo-server.onrender.com`

You can paste this URL into `LudoKing_App/src/services/gameServerClient.ts` to switch from P2P Supabase to your dedicated server anytime!
