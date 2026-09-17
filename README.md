# Wealthi

Copy your chat.db from ~/Library/Messages/chat.db to backend/data/chat.db
Copy backend/config/wealthi.example.json to backend/config/wealthi.json and fill in your balances, merchants and transfer rules
Start Postgres: docker compose up -d
Push the schema: npm run db:push
Start the server: npm run dev
