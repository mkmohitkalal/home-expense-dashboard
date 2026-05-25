# FinanceFlow - Premium Home Expense & Carryover Dashboard

A premium, interactive single-page web dashboard designed to manage monthly savings, cash flow, credit card dues, and roll-over balances. Built entirely with pure static HTML, CSS, and vanilla JS, utilizing browser `localStorage` for 100% private data persistence.

## Key Features
- **Smart NLP parser:** Record transactions in natural language (e.g. `spent 1200 on petrol via HDFC yesterday`, `gave 100 rs to mohit and 250 later to mohit`).
- **All-Time Debt Tracker:** Beautiful side-by-side interactive cards to track personal loans with animated progress bars and settled markers.
- **Roll-over Carrying Balance:** Monthly remaining balances dynamically cascade forward to the next month as the opening balance.
- **Multiple Payment Channels:** Track cash balance and outstanding dues on individual credit cards (HDFC, ICICI) and prepaid cards (Go Sats).
- **Responsive Dashboard Layout:** Adapts flawlessly to mobile, tablet, and desktop views.
- **Backup & Restore:** Single-click CSV (Google Sheets/Excel compatible) and JSON data export and import.
- **Multi-Theme UI:** Smooth theme switcher supporting Sleek Dark mode and Clean Light mode.

## Local Sizing & Execution
1. Double-click `index.html` to run directly in any browser, or serve it using the simple helper server:
   ```bash
   python serve.py
   ```
2. Open `http://localhost:8080` in your web browser.

## Hosting Online (GitHub Pages)
This repository is 100% compatible with static hosting services like **GitHub Pages**. To host it online for free and access it on your mobile phone:
1. Push this code to a new repository on your GitHub account.
2. Go to **Settings** -> **Pages** in your GitHub repository.
3. Under **Build and deployment**, select the `main` branch and the `/ (root)` folder.
4. Click **Save**. Within a minute, your app will be live at `https://<your-username>.github.io/<your-repo-name>/`!
