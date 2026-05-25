/**
 * app.js - Core controller and state manager for Home Expense Dashboard
 */

// Application State
let state = {
  transactions: [],
  selectedMonth: '', // "YYYY-MM"
  activeTab: 'overview', // 'overview', 'transactions', 'analytics', 'backup'
  editingTxId: null // ID of transaction currently being edited
};

// Helper: Format Date as YYYY-MM
function getYearMonthString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Data migration/repair helper for past entries
function repairExistingTransactions() {
  let modified = false;

  const invalidNames = ['for', 'to', 'on', 'via', 'using', 'with', 'by', 'in', 'at', 'of', 'me', 'cash', 'card', 'icici', 'hdfc', 'sats', 'gosats', 'prepaid', 'bank', 'interest', 'salary', 'employer', 'refund', 'electricity', 'bill', 'rent', 'groceries', 'food', 'fuel', 'petrol', 'diesel', 'utility', 'utilities', 'shopping', 'medicine', 'starbucks', 'zomato', 'swiggy', 'uber', 'ola', 'movie', 'netflix', 'wifi', 'internet', 'broadband', 'mobile', 'recharge', 'dth', 'power', 'water', 'gas', 'house', 'flat', 'maid', 'cook', 'maintenance', 'society', 'insurance', 'tax', 'taxes', 'fees', 'school', 'college', 'tuition', 'gift', 'gifts', 'clothes', 'shoes', 'gadget', 'phone', 'laptop', 'device', 'ticket', 'flight', 'train', 'bus', 'hotel', 'dining', 'restaurant', 'cafe', 'pizza', 'burger', 'snacks', 'starbucks', 'starbuck', 'star', 'bucks', 'subway', 'maggi', 'kirana', 'mart', 'supermarket', 'dmart', 'd-mart', 'milk', 'vegetables', 'fruits', 'veg', 'bread', 'eggs', 'laundry', 'washer', 'dryer', 'salary', 'bonus', 'dividend', 'pocket', 'money', 'hand', 'transfer'];

  state.transactions.forEach(tx => {
    const desc = tx.description.trim();

    // Check if we can identify a loan name in expense
    if (tx.type === 'expense') {
      const matches = desc.match(/\b(?:lent|gave|sent|paid|loaned)\s+(?:(?:rs\.?|inr|₹|rupees)?\s*\d+(?:\.\d{1,2})?\s*)?(?:to\s+)?([A-Za-z]+)\b/i) ||
                      desc.match(/\b(?:lent|gave|sent|paid|loaned)\s+([A-Za-z]+)\s+(?:(?:rs\.?|inr|₹|rupees)?\s*\d+(?:\.\d{1,2})?)\b/i);

      if (matches) {
        const name = matches[1].trim();
        if (name && !invalidNames.includes(name.toLowerCase())) {
          const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

          if (tx.sourcePerson !== capitalizedName || tx.category !== 'Lent/Loan') {
            tx.sourcePerson = capitalizedName;
            tx.category = 'Lent/Loan';
            if (tx.description.toLowerCase().startsWith('lent') || tx.description.toLowerCase().startsWith('sent') || tx.description.toLowerCase().startsWith('gave') || tx.description.toLowerCase().startsWith('paid')) {
              tx.description = `Lent to ${capitalizedName}`;
            }
            modified = true;
          }
        }
      }
    }

    // Check if we can identify a repayment name in income
    if (tx.type === 'income') {
      const matches = desc.match(/\b(?:returned\s+from|received\s+from|from|back\s+from|recovered\s+from|got\s+back\s+from)\s+([A-Za-z]+)\b/i) ||
                      desc.match(/\b([A-Za-z]+)\s+(?:returned|repaid|paid\s+back|gave\s+back)\b/i) ||
                      desc.match(/\b(?:returned|repaid|paid\s+back|gave\s+back)\s+from\s+([A-Za-z]+)\b/i);

      if (matches) {
        const name = matches[1].trim();
        if (name && !invalidNames.includes(name.toLowerCase())) {
          const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

          if (tx.sourcePerson !== capitalizedName || tx.category !== 'Debt Recovery') {
            tx.sourcePerson = capitalizedName;
            tx.category = 'Debt Recovery';
            if (tx.description.toLowerCase().includes('return') || tx.description.toLowerCase().includes('recover') || tx.description.toLowerCase().includes('repaid')) {
              tx.description = `Recovered from ${capitalizedName}`;
            }
            modified = true;
          }
        }
      }
    }
  });

  if (modified) {
    localStorage.setItem('home_expenses_transactions', JSON.stringify(state.transactions));
  }
}

// Initialize Application State
function initStore() {
  // Load transactions from localStorage
  const savedTxs = localStorage.getItem('home_expenses_transactions');
  if (savedTxs) {
    try {
      state.transactions = JSON.parse(savedTxs);
      // Run data migration to populate sourcePerson names for old transactions if empty
      repairExistingTransactions();
    } catch (e) {
      console.error("Error parsing transactions from local storage", e);
      state.transactions = [];
    }
  } else {
    // Inject seed data if empty so the user is wowed immediately by a populated dashboard
    state.transactions = getSeedData();
    localStorage.setItem('home_expenses_transactions', JSON.stringify(state.transactions));
  }

  // Set default selected month to current month
  const today = new Date();
  state.selectedMonth = getYearMonthString(today);
}

// Generate nice dummy data for testing / initial experience
function getSeedData() {
  const baseYear = new Date().getFullYear();
  const baseMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  
  // Previous month helper
  let prevMonthVal = new Date().getMonth(); // 0-indexed
  let prevYearVal = baseYear;
  if (prevMonthVal === 0) {
    prevMonthVal = 12;
    prevYearVal -= 1;
  }
  const prevMonthStr = String(prevMonthVal).padStart(2, '0');

  return [
    // Previous Month Transactions (to demonstrate roll-over!)
    {
      id: 'tx-seed-1',
      type: 'income',
      amount: 45000,
      description: 'Monthly Salary',
      paymentMode: 'Cash',
      category: 'Salary',
      sourcePerson: 'Employer',
      date: `${prevYearVal}-${prevMonthStr}-01`
    },
    {
      id: 'tx-seed-2',
      type: 'expense',
      amount: 15000,
      description: 'House Rent',
      paymentMode: 'Cash',
      category: 'Rent & Maintenance',
      sourcePerson: '',
      date: `${prevYearVal}-${prevMonthStr}-02`
    },
    {
      id: 'tx-seed-3',
      type: 'expense',
      amount: 3200,
      description: 'Electricity Bill payment',
      paymentMode: 'HDFC TATA Neu Credit Card',
      category: 'Utilities',
      sourcePerson: '',
      date: `${prevYearVal}-${prevMonthStr}-05`
    },
    {
      id: 'tx-seed-4',
      type: 'expense',
      amount: 4500,
      description: 'Grocery shopping D-Mart',
      paymentMode: 'ICICI Amazon Pay Credit Card',
      category: 'Groceries',
      sourcePerson: '',
      date: `${prevYearVal}-${prevMonthStr}-12`
    },
    
    // Current Month Transactions
    {
      id: 'tx-seed-5',
      type: 'income',
      amount: 55000,
      description: 'Monthly Salary Credit',
      paymentMode: 'Cash',
      category: 'Salary',
      sourcePerson: 'Employer',
      date: `${baseYear}-${baseMonth}-01`
    },
    {
      id: 'tx-seed-6',
      type: 'income',
      amount: 5000,
      description: 'Received from Amit',
      paymentMode: 'Cash',
      category: 'Personal Transfer',
      sourcePerson: 'Amit',
      date: `${baseYear}-${baseMonth}-04`
    },
    {
      id: 'tx-seed-7',
      type: 'expense',
      amount: 16500,
      description: 'Monthly Rent',
      paymentMode: 'Cash',
      category: 'Rent & Maintenance',
      sourcePerson: '',
      date: `${baseYear}-${baseMonth}-02`
    },
    {
      id: 'tx-seed-8',
      type: 'expense',
      amount: 850,
      description: 'Weekly milk and veggies',
      paymentMode: 'Cash',
      category: 'Groceries',
      sourcePerson: '',
      date: `${baseYear}-${baseMonth}-03`
    },
    {
      id: 'tx-seed-9',
      type: 'expense',
      amount: 1250,
      description: 'Swiggy Dinner party',
      paymentMode: 'HDFC TATA Neu Credit Card',
      category: 'Food & Dining',
      sourcePerson: '',
      date: `${baseYear}-${baseMonth}-05`
    },
    {
      id: 'tx-seed-10',
      type: 'expense',
      amount: 4200,
      description: 'Broadband and Mobile recharges',
      paymentMode: 'Go Sats Prepaid Debit Card',
      category: 'Utilities',
      sourcePerson: '',
      date: `${baseYear}-${baseMonth}-08`
    },
    {
      id: 'tx-seed-11',
      type: 'expense',
      amount: 3500,
      description: 'Petrol full tank',
      paymentMode: 'ICICI Amazon Pay Credit Card',
      category: 'Travel & Fuel',
      sourcePerson: '',
      date: `${baseYear}-${baseMonth}-15`
    }
  ];
}

// Generate consecutive months between two bounds
function getMonthRange(minMonth, maxMonth) {
  const months = [];
  
  if (!minMonth || !maxMonth) return [minMonth || maxMonth || ''];
  
  let current = new Date(minMonth + "-02"); // use 2nd day to bypass timezone issues
  const end = new Date(maxMonth + "-02");
  
  if (isNaN(current.getTime()) || isNaN(end.getTime())) {
    return [minMonth];
  }
  
  let iterations = 0;
  while (current <= end && iterations < 1200) { // Safety cap: max 100 years range
    iterations++;
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}

// Compute Carryover balances and month stats recursively/chronologically
function computeMonthlySummaries() {
  if (state.transactions.length === 0) {
    const summaries = {};
    const baseOpeningBalance = parseFloat(localStorage.getItem('base_opening_balance') || '0');
    
    const initialChannels = {
      [PaymentModes.CASH]: baseOpeningBalance,
      [PaymentModes.ICICI]: 0,
      [PaymentModes.HDFC]: 0,
      [PaymentModes.GOSATS]: 0
    };
    
    summaries[state.selectedMonth] = {
      opening: baseOpeningBalance,
      income: 0,
      expense: 0,
      closing: baseOpeningBalance,
      channels: {
        starting: initialChannels,
        monthly: {
          [PaymentModes.CASH]: { income: 0, expense: 0 },
          [PaymentModes.ICICI]: { income: 0, expense: 0 },
          [PaymentModes.HDFC]: { income: 0, expense: 0 },
          [PaymentModes.GOSATS]: { income: 0, expense: 0 }
        },
        ending: initialChannels
      }
    };
    return summaries;
  }

  // Find min and max months in database
  let minMonth = state.selectedMonth;
  let maxMonth = state.selectedMonth;

  state.transactions.forEach(tx => {
    const m = tx.date.substring(0, 7);
    if (m < minMonth) minMonth = m;
    if (m > maxMonth) maxMonth = m;
  });

  const allMonths = getMonthRange(minMonth, maxMonth);
  const summaries = {};

  // Starting base balance from localStorage goes to Cash as the baseline asset
  const baseOpeningBalance = parseFloat(localStorage.getItem('base_opening_balance') || '0');
  let runningBalances = {
    [PaymentModes.CASH]: baseOpeningBalance,
    [PaymentModes.ICICI]: 0,
    [PaymentModes.HDFC]: 0,
    [PaymentModes.GOSATS]: 0
  };

  for (const m of allMonths) {
    const monthTxs = state.transactions.filter(tx => tx.date.substring(0, 7) === m);
    
    // Group monthly flows by payment channel
    const monthlyFlows = {
      [PaymentModes.CASH]: { income: 0, expense: 0 },
      [PaymentModes.ICICI]: { income: 0, expense: 0 },
      [PaymentModes.HDFC]: { income: 0, expense: 0 },
      [PaymentModes.GOSATS]: { income: 0, expense: 0 }
    };
    
    monthTxs.forEach(tx => {
      const mode = tx.paymentMode || PaymentModes.CASH;
      if (mode in monthlyFlows) {
        if (tx.type === 'income') {
          monthlyFlows[mode].income += tx.amount;
        } else {
          monthlyFlows[mode].expense += tx.amount;
        }
      }
    });

    // Capture starting balances for this month
    const openingBalances = { ...runningBalances };

    // Update running balances
    // Assets (Cash, Go Sats): Balance increases with Income, decreases with Expense
    runningBalances[PaymentModes.CASH] += monthlyFlows[PaymentModes.CASH].income - monthlyFlows[PaymentModes.CASH].expense;
    runningBalances[PaymentModes.GOSATS] += monthlyFlows[PaymentModes.GOSATS].income - monthlyFlows[PaymentModes.GOSATS].expense;
    
    // Liabilities (Credit Cards): Outstanding dues increase with Expense, decrease with Income (Payments)
    runningBalances[PaymentModes.ICICI] += monthlyFlows[PaymentModes.ICICI].expense - monthlyFlows[PaymentModes.ICICI].income;
    runningBalances[PaymentModes.HDFC] += monthlyFlows[PaymentModes.HDFC].expense - monthlyFlows[PaymentModes.HDFC].income;

    // Capture ending balances for this month
    const closingBalances = { ...runningBalances };

    // Calculate Net starting and ending balances for overall stats
    const monthOpening = openingBalances[PaymentModes.CASH] + openingBalances[PaymentModes.GOSATS] - openingBalances[PaymentModes.ICICI] - openingBalances[PaymentModes.HDFC];
    const monthClosing = closingBalances[PaymentModes.CASH] + closingBalances[PaymentModes.GOSATS] - closingBalances[PaymentModes.ICICI] - closingBalances[PaymentModes.HDFC];

    const income = monthTxs.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
    const expense = monthTxs.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);

    summaries[m] = {
      opening: monthOpening,
      income,
      expense,
      closing: monthClosing,
      channels: {
        starting: openingBalances,
        monthly: monthlyFlows,
        ending: closingBalances
      }
    };
  }

  // If selected month is somehow outside the transaction range, calculate it
  if (!summaries[state.selectedMonth]) {
    const monthOpening = runningBalances[PaymentModes.CASH] + runningBalances[PaymentModes.GOSATS] - runningBalances[PaymentModes.ICICI] - runningBalances[PaymentModes.HDFC];
    summaries[state.selectedMonth] = {
      opening: monthOpening,
      income: 0,
      expense: 0,
      closing: monthOpening,
      channels: {
        starting: { ...runningBalances },
        monthly: {
          [PaymentModes.CASH]: { income: 0, expense: 0 },
          [PaymentModes.ICICI]: { income: 0, expense: 0 },
          [PaymentModes.HDFC]: { income: 0, expense: 0 },
          [PaymentModes.GOSATS]: { income: 0, expense: 0 }
        },
        ending: { ...runningBalances }
      }
    };
  }

  return summaries;
}

// Render Header Dates and Dashboard stats boxes
function renderDashboardMetrics() {
  const summaries = computeMonthlySummaries();
  const currentSummary = summaries[state.selectedMonth] || { opening: 0, income: 0, expense: 0, closing: 0 };

  // Set visual values
  document.getElementById('openingBalanceVal').innerText = `₹${currentSummary.opening.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  document.getElementById('totalIncomeVal').innerText = `₹${currentSummary.income.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  document.getElementById('totalExpenseVal').innerText = `₹${currentSummary.expense.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  document.getElementById('closingBalanceVal').innerText = `₹${currentSummary.closing.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Calculate total outstanding personal loans across all history
  let totalOwed = 0;
  const tempDebts = {};
  state.transactions.forEach(tx => {
    if (!tx.sourcePerson || tx.sourcePerson.trim() === '') return;
    const nameKey = tx.sourcePerson.trim().toLowerCase();
    if (!tempDebts[nameKey]) {
      tempDebts[nameKey] = { lent: 0, recovered: 0 };
    }
    if (tx.type === 'expense' && tx.category === 'Lent/Loan') {
      tempDebts[nameKey].lent += tx.amount;
    } else if (tx.type === 'income' && (tx.category === 'Debt Recovery' || tx.category === 'Personal Transfer')) {
      tempDebts[nameKey].recovered += tx.amount;
    }
  });
  
  Object.values(tempDebts).forEach(d => {
    const outstanding = d.lent - d.recovered;
    if (outstanding > 0) {
      totalOwed += outstanding;
    }
  });

  const lentCardVal = document.getElementById('totalLentVal');
  if (lentCardVal) {
    lentCardVal.innerText = `₹${totalOwed.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Payment Mode details tracking
  renderPaymentModeSummary();
}

// Calculate and render payment mode summary list
function renderPaymentModeSummary() {
  const listElement = document.getElementById('paymentModesList');
  if (!listElement) return;

  const summaries = computeMonthlySummaries();
  const currentSummary = summaries[state.selectedMonth];
  if (!currentSummary || !currentSummary.channels) return;

  const starting = currentSummary.channels.starting;
  const monthly = currentSummary.channels.monthly;
  const ending = currentSummary.channels.ending;

  listElement.innerHTML = `
    <!-- Cash Card -->
    <div class="payment-mode-pill-card cash">
      <div class="payment-mode-info">
        <div class="payment-mode-avatar">💵</div>
        <div>
          <div class="payment-mode-name">Cash</div>
          <div class="payment-mode-type">Physical Balance</div>
        </div>
      </div>
      <div style="text-align: right;">
        <div class="payment-mode-amount" style="color: var(--accent-income);">
          ₹${ending[PaymentModes.CASH].toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </div>
        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">
          Start: ₹${starting[PaymentModes.CASH].toLocaleString('en-IN')} | In: ₹${monthly[PaymentModes.CASH].income.toLocaleString('en-IN')} | Out: ₹${monthly[PaymentModes.CASH].expense.toLocaleString('en-IN')}
        </div>
      </div>
    </div>

    <!-- ICICI Card -->
    <div class="payment-mode-pill-card icici">
      <div class="payment-mode-info">
        <div class="payment-mode-avatar">💳</div>
        <div>
          <div class="payment-mode-name">ICICI Amazon Pay</div>
          <div class="payment-mode-type">Credit Card Dues</div>
        </div>
      </div>
      <div style="text-align: right;">
        <div class="payment-mode-amount" style="color: ${ending[PaymentModes.ICICI] > 0 ? 'var(--accent-expense)' : 'var(--accent-income)'};">
          ₹${ending[PaymentModes.ICICI].toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </div>
        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">
          Start: ₹${starting[PaymentModes.ICICI].toLocaleString('en-IN')} | Spent: ₹${monthly[PaymentModes.ICICI].expense.toLocaleString('en-IN')} | Paid: ₹${monthly[PaymentModes.ICICI].income.toLocaleString('en-IN')}
        </div>
      </div>
    </div>

    <!-- HDFC Card -->
    <div class="payment-mode-pill-card hdfc">
      <div class="payment-mode-info">
        <div class="payment-mode-avatar">💳</div>
        <div>
          <div class="payment-mode-name">HDFC TATA Neu</div>
          <div class="payment-mode-type">Credit Card Dues</div>
        </div>
      </div>
      <div style="text-align: right;">
        <div class="payment-mode-amount" style="color: ${ending[PaymentModes.HDFC] > 0 ? 'var(--accent-expense)' : 'var(--accent-income)'};">
          ₹${ending[PaymentModes.HDFC].toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </div>
        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">
          Start: ₹${starting[PaymentModes.HDFC].toLocaleString('en-IN')} | Spent: ₹${monthly[PaymentModes.HDFC].expense.toLocaleString('en-IN')} | Paid: ₹${monthly[PaymentModes.HDFC].income.toLocaleString('en-IN')}
        </div>
      </div>
    </div>

    <!-- Go Sats Card -->
    <div class="payment-mode-pill-card gosats">
      <div class="payment-mode-info">
        <div class="payment-mode-avatar">⚡</div>
        <div>
          <div class="payment-mode-name">Go Sats</div>
          <div class="payment-mode-type">Prepaid Balance</div>
        </div>
      </div>
      <div style="text-align: right;">
        <div class="payment-mode-amount" style="color: var(--accent-income);">
          ₹${ending[PaymentModes.GOSATS].toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </div>
        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">
          Start: ₹${starting[PaymentModes.GOSATS].toLocaleString('en-IN')} | In: ₹${monthly[PaymentModes.GOSATS].income.toLocaleString('en-IN')} | Out: ₹${monthly[PaymentModes.GOSATS].expense.toLocaleString('en-IN')}
        </div>
      </div>
    </div>
  `;
}

// Render Transactions List Table
function renderTransactionsTable(filterSearch = '', filterType = 'all', filterMode = 'all') {
  const tableBody = document.getElementById('txTableBody');
  if (!tableBody) return;

  let filteredTxs = state.transactions.filter(tx => tx.date.substring(0, 7) === state.selectedMonth);

  // Apply filters
  if (filterType !== 'all') {
    filteredTxs = filteredTxs.filter(tx => tx.type === filterType);
  }
  if (filterMode !== 'all') {
    filteredTxs = filteredTxs.filter(tx => tx.paymentMode === filterMode);
  }
  if (filterSearch.trim() !== '') {
    const q = filterSearch.toLowerCase();
    filteredTxs = filteredTxs.filter(tx => 
      tx.description.toLowerCase().includes(q) ||
      tx.category.toLowerCase().includes(q) ||
      (tx.sourcePerson && tx.sourcePerson.toLowerCase().includes(q))
    );
  }

  // Sort descending by date
  filteredTxs.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (filteredTxs.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <div class="empty-state-icon">📁</div>
            <p>No transactions found for the filters selected in this month.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filteredTxs.map(tx => {
    const dateFormatted = new Date(tx.date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const isIncome = tx.type === 'income';
    const amountClass = isIncome ? 'income' : 'expense';
    const amountSign = isIncome ? '+' : '-';
    
    // Icon mapping for category
    const catIcons = {
      'Groceries': '🛒',
      'Food & Dining': '🍔',
      'Utilities': '🔌',
      'Travel & Fuel': '⛽',
      'Entertainment': '🎬',
      'Shopping': '🛍️',
      'Medical & Health': '💊',
      'Rent & Maintenance': '🏠',
      'Salary': '💼',
      'Personal Transfer': '🤝',
      'Refund': '🔄',
      'Bonus/Interest': '📈',
      'Others': '🏷️'
    };
    const icon = catIcons[tx.category] || '🏷️';

    return `
      <tr>
        <td>${dateFormatted}</td>
        <td>
          <span class="type-badge ${tx.type}">
            ${isIncome ? '💰 Income' : '💸 Expense'}
          </span>
        </td>
        <td style="font-weight: 500;">
          <span style="margin-right: 0.5rem;">${icon}</span> ${tx.category}
        </td>
        <td>
          ${tx.description} 
          ${tx.sourcePerson ? `<span style="font-size:0.8rem; color:var(--text-muted);">(${tx.sourcePerson})</span>` : ''}
        </td>
        <td>
          <span class="payment-badge">${tx.paymentMode || 'N/A'}</span>
        </td>
        <td>
          <span class="tx-amount ${amountClass}">
            ${amountSign}₹${tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </td>
        <td>
          <div class="action-buttons">
            <button class="action-btn" onclick="openEditModal('${tx.id}')" title="Edit Transaction">✏️</button>
            <button class="action-btn delete" onclick="deleteTransaction('${tx.id}')" title="Delete Transaction">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Add/Save transaction into global state
function saveTransaction(txData) {
  if (state.editingTxId) {
    // Edit existing transaction
    const index = state.transactions.findIndex(t => t.id === state.editingTxId);
    if (index !== -1) {
      state.transactions[index] = { ...state.transactions[index], ...txData };
      showToast("Transaction updated successfully!", "success");
    }
    state.editingTxId = null;
  } else {
    // Add new transaction
    const newTx = {
      id: 'tx-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      ...txData
    };
    state.transactions.push(newTx);
    showToast("Transaction added successfully!", "success");
  }

  // Persist to local storage
  localStorage.setItem('home_expenses_transactions', JSON.stringify(state.transactions));
  
  // Recalculate and re-render
  refreshDashboard();
}

// Save multiple new transactions at once (e.g. from compound NLP parsing)
function saveTransactionsMultiple(txDataArray) {
  txDataArray.forEach((txData, index) => {
    const newTx = {
      id: 'tx-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9) + '-' + index,
      ...txData
    };
    state.transactions.push(newTx);
  });
  
  localStorage.setItem('home_expenses_transactions', JSON.stringify(state.transactions));
  showToast(`Added ${txDataArray.length} transactions successfully!`, "success");
  refreshDashboard();
}

// Delete transaction
function deleteTransaction(id) {
  if (confirm("Are you sure you want to delete this transaction?")) {
    state.transactions = state.transactions.filter(t => t.id !== id);
    localStorage.setItem('home_expenses_transactions', JSON.stringify(state.transactions));
    showToast("Transaction deleted successfully!", "success");
    refreshDashboard();
  }
}

// Render Lent/Loan Tracker for Active Loans
function renderLentTracker() {
  const trackerPanel = document.getElementById('lentTrackerPanel');
  const listContainer = document.getElementById('lentListContainer');
  if (!trackerPanel || !listContainer) return;

  // Process ALL transactions to build personal loan records
  const debts = {}; // keyed by name lowercase

  state.transactions.forEach(tx => {
    if (!tx.sourcePerson || tx.sourcePerson.trim() === '') return;
    const name = tx.sourcePerson.trim();
    const nameKey = name.toLowerCase();

    if (!debts[nameKey]) {
      debts[nameKey] = {
        name: name,
        lent: 0,
        recovered: 0
      };
    }

    if (tx.type === 'expense' && tx.category === 'Lent/Loan') {
      debts[nameKey].lent += tx.amount;
    } else if (tx.type === 'income' && (tx.category === 'Debt Recovery' || tx.category === 'Personal Transfer')) {
      debts[nameKey].recovered += tx.amount;
    }
  });

  // Filter out entries that have 0 lent (we only want to track people we actually lent money to)
  const activeDebts = Object.values(debts).filter(d => d.lent > 0);

  // Show panel if we are on the overview tab
  const showTracker = state.activeTab === 'overview';
  trackerPanel.style.display = showTracker ? 'block' : 'none';

  if (!showTracker) return;

  if (activeDebts.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state" style="padding: 2rem 1rem; width: 100%; grid-column: 1 / -1; background: var(--card-bg-subtle); border: 1px dashed var(--glass-border); border-radius: var(--radius-md);">
        <div class="empty-state-icon" style="font-size: 2rem; opacity: 0.3;">🤝</div>
        <p style="font-weight: 500; color: var(--text-secondary); margin-top: 0.5rem;">No active personal loans tracked yet.</p>
        <p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.25rem;">
          Try typing: <strong>"lent 5000 to Amit"</strong> or <strong>"gave 3000 to Rahul"</strong> in the smart input box above.
        </p>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = activeDebts.map(d => {
    const outstanding = d.lent - d.recovered;
    const isSettled = outstanding <= 0;
    
    // Recovery progress percentage (capped at 100, min 0)
    const progress = d.lent > 0 ? Math.min(100, Math.max(0, (d.recovered / d.lent) * 100)) : 0;
    
    const statusText = isSettled ? 'Fully Settled' : 'Active Loan';
    const statusClass = isSettled ? 'settled' : 'active';
    const outstandingText = isSettled 
      ? 'Settled 🎉' 
      : `₹${outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    const initials = d.name.substring(0, 2).toUpperCase();

    return `
      <div class="lent-card ${isSettled ? 'settled' : ''}">
        <div class="lent-card-header">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div class="lent-avatar">${initials}</div>
            <div class="lent-person-details">
              <div class="lent-name">${d.name}</div>
              <div class="lent-sub ${statusClass}">${statusText}</div>
            </div>
          </div>
          <div class="lent-outstanding-badge ${statusClass}">
            ${isSettled ? 'Settled 🎉' : `Owed: ${outstandingText}`}
          </div>
        </div>
        <div class="lent-amounts">
          <div class="lent-amount-item">
            <div class="lent-amount-label">Total Lent</div>
            <div class="lent-amount-val">₹${d.lent.toLocaleString('en-IN')}</div>
          </div>
          <div class="lent-amount-item">
            <div class="lent-amount-label">Recovered</div>
            <div class="lent-amount-val income">₹${d.recovered.toLocaleString('en-IN')}</div>
          </div>
        </div>
        <div class="lent-progress-section">
          <div style="display:flex; justify-content:space-between; font-size:0.72rem; margin-bottom:0.35rem;">
            <span style="color:var(--text-secondary);">Recovery Progress</span>
            <span style="font-weight:600; color:var(--text-primary);">${Math.round(progress)}%</span>
          </div>
          <div class="lent-progress-bar-bg">
            <div class="lent-progress-bar-fill" style="width: ${progress}%;"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Refresh whole layout views
function refreshDashboard() {
  renderDashboardMetrics();
  
  // Refresh table
  const searchVal = document.getElementById('searchTx')?.value || '';
  const typeFilter = document.getElementById('filterType')?.value || 'all';
  const modeFilter = document.getElementById('filterMode')?.value || 'all';
  renderTransactionsTable(searchVal, typeFilter, modeFilter);

  // Render Lent Tracker
  renderLentTracker();

  // Re-draw charts
  if (typeof drawCharts === 'function') {
    const currentMonthTxs = state.transactions.filter(tx => tx.date.substring(0, 7) === state.selectedMonth);
    drawCharts(currentMonthTxs);
  }
}

// Tabs switching handler
function switchTab(tabName) {
  state.activeTab = tabName;
  
  // Toggle nav classes
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === tabName);
  });

  // Toggle view grids
  document.getElementById('overviewGrid').style.display = tabName === 'overview' ? 'grid' : 'none';
  document.getElementById('chartsPanel').style.display = tabName === 'analytics' ? 'grid' : 'none';
  
  // Update lent tracker display status
  renderLentTracker();

  // For transactions, we show it directly inside the main workspace
  const txTablePanel = document.getElementById('transactionsTablePanel');
  if (tabName === 'transactions') {
    txTablePanel.style.display = 'flex';
    // Hide standard grid panels
    document.getElementById('overviewGrid').style.display = 'none';
    document.getElementById('chartsPanel').style.display = 'none';
    document.getElementById('backupPanel').style.display = 'none';
  } else if (tabName === 'backup') {
    document.getElementById('backupPanel').style.display = 'grid';
    txTablePanel.style.display = 'none';
  } else {
    // Analytics or Overview
    document.getElementById('backupPanel').style.display = 'none';
    txTablePanel.style.display = 'flex'; // Keep it at bottom of overview or analytics if needed, but let's hide/show cleanly
    txTablePanel.style.display = (tabName === 'overview' || tabName === 'transactions') ? 'flex' : 'none';
  }
}

// Month Selector configuration
function setupMonthSelector() {
  const selector = document.getElementById('monthSelect');
  if (!selector) return;

  // Let's populate the month selector with recent 12 months and future 6 months
  const months = [];
  const today = new Date();
  
  // Start from 12 months ago
  const start = new Date();
  start.setMonth(today.getMonth() - 12);
  
  // End at 6 months in the future
  const end = new Date();
  end.setMonth(today.getMonth() + 6);
  
  let curr = new Date(start);
  while (curr <= end) {
    months.push(getYearMonthString(curr));
    curr.setMonth(curr.getMonth() + 1);
  }

  // Make sure current selectedMonth is in there
  if (!months.includes(state.selectedMonth)) {
    months.push(state.selectedMonth);
    months.sort();
  }

  selector.innerHTML = months.map(m => {
    const [y, mm] = m.split('-');
    const dateObj = new Date(parseInt(y), parseInt(mm) - 1, 15);
    const label = dateObj.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    return `<option value="${m}" ${m === state.selectedMonth ? 'selected' : ''}>${label}</option>`;
  }).join('');

  selector.addEventListener('change', (e) => {
    state.selectedMonth = e.target.value;
    refreshDashboard();
  });

  document.getElementById('prevMonthBtn').addEventListener('click', () => {
    adjustMonth(-1);
  });
  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    adjustMonth(1);
  });
}

function adjustMonth(offset) {
  const [y, m] = state.selectedMonth.split('-').map(Number);
  const dateObj = new Date(y, m - 1 + offset, 15);
  state.selectedMonth = getYearMonthString(dateObj);
  
  // Update select input value
  const selector = document.getElementById('monthSelect');
  if (selector) {
    // If month doesn't exist in option, repopulate
    let exists = false;
    for (let opt of selector.options) {
      if (opt.value === state.selectedMonth) {
        exists = true;
        break;
      }
    }
    if (!exists) {
      setupMonthSelector();
    }
    selector.value = state.selectedMonth;
  }
  refreshDashboard();
}

// Edit Modal trigger
window.openEditModal = function(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;

  state.editingTxId = id;
  document.getElementById('modalTitle').innerText = "Edit Transaction Details";
  
  // Populate form fields
  document.getElementById('formDate').value = tx.date;
  document.getElementById('formType').value = tx.type;
  document.getElementById('formAmount').value = tx.amount;
  document.getElementById('formDesc').value = tx.description;
  document.getElementById('formPayment').value = tx.paymentMode || 'Cash';
  document.getElementById('formCategory').value = tx.category;
  
  const sourcePersonRow = document.getElementById('formPersonRow');
  const sourcePersonInput = document.getElementById('formPerson');
  sourcePersonInput.value = tx.sourcePerson || '';
  
  // Toggle source person display based on type or Lent category
  if (tx.type === 'income' || tx.category === 'Lent/Loan') {
    sourcePersonRow.style.display = 'flex';
  } else {
    sourcePersonRow.style.display = 'none';
  }

  // Populate categories list based on type
  updateFormCategories(tx.type, tx.category);

  // Activate overlay
  document.getElementById('editModal').classList.add('active');
};

function updateFormCategories(type, selectVal = '') {
  const catSelect = document.getElementById('formCategory');
  const cats = type === 'income' ? IncomeCategories : ExpenseCategories;
  catSelect.innerHTML = cats.map(c => `<option value="${c}" ${c === selectVal ? 'selected' : ''}>${c}</option>`).join('');
}

// Close Modal
function closeEditModal() {
  state.editingTxId = null;
  document.getElementById('editModal').classList.remove('active');
  document.getElementById('editForm').reset();
}

// Toast Notifications
function showToast(message, type = 'success') {
  const toast = document.getElementById('toastNotification');
  if (!toast) return;

  toast.className = `toast active ${type}`;
  toast.querySelector('.toast-msg').innerText = message;
  toast.querySelector('.toast-icon').innerText = type === 'success' ? '✅' : '❌';

  setTimeout(() => {
    toast.classList.remove('active');
  }, 4000);
}

// NLP Live Parser Handler
function setupNlpInput() {
  const input = document.getElementById('nlpInput');
  const previewBox = document.getElementById('livePreviewBox');
  const addBtn = document.getElementById('addTxBtn');

  if (!input) return;

  input.addEventListener('input', (e) => {
    const text = e.target.value;
    
    // Parse on the fly
    // Use base date matching the selected dashboard month
    const yearMonth = state.selectedMonth.split('-');
    const baseDate = new Date(parseInt(yearMonth[0]), parseInt(yearMonth[1]) - 1, new Date().getDate());
    
    const parsedList = parseCompoundTransactionText(text, baseDate);
    const firstParsed = parsedList[0];

    if (firstParsed && firstParsed.isValid && text.trim().length > 3) {
      previewBox.classList.add('active');
      addBtn.removeAttribute('disabled');

      // Update Preview Details
      const typeBadge = document.getElementById('previewType');
      if (parsedList.length > 1) {
        typeBadge.className = `preview-badge type-income`;
        typeBadge.style.background = 'rgba(99, 102, 241, 0.12)';
        typeBadge.style.borderColor = 'rgba(99, 102, 241, 0.25)';
        typeBadge.style.color = 'var(--accent-balance)';
        typeBadge.innerText = `🔗 ${parsedList.length} Items`;

        const totalAmount = parsedList.reduce((sum, p) => sum + (p.amount || 0), 0);
        document.getElementById('previewAmount').innerText = `₹${totalAmount.toLocaleString('en-IN')}`;
        
        const descriptions = parsedList.map(p => p.description).join(' + ');
        document.getElementById('previewDesc').innerText = `📝 ${descriptions}`;
      } else {
        typeBadge.className = `preview-badge type-${firstParsed.type}`;
        typeBadge.style.background = '';
        typeBadge.style.borderColor = '';
        typeBadge.style.color = '';
        typeBadge.innerText = firstParsed.type === 'income' ? '💰 Income' : '💸 Expense';

        document.getElementById('previewAmount').innerText = `₹${firstParsed.amount.toLocaleString('en-IN')}`;
        document.getElementById('previewDesc').innerText = `📝 ${firstParsed.description}`;
      }

      document.getElementById('previewPayment').innerText = `💳 ${firstParsed.paymentMode || 'Cash'}`;
      
      const parsedDate = new Date(firstParsed.date);
      document.getElementById('previewDate').innerText = `📅 ${parsedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
    } else {
      previewBox.classList.remove('active');
      addBtn.setAttribute('disabled', 'true');
    }
  });

  // Handle enter key to submit
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitNlpTransaction();
    }
  });
}

function submitNlpTransaction() {
  const input = document.getElementById('nlpInput');
  const text = input.value;
  
  const yearMonth = state.selectedMonth.split('-');
  const baseDate = new Date(parseInt(yearMonth[0]), parseInt(yearMonth[1]) - 1, new Date().getDate());
  
  const parsedList = parseCompoundTransactionText(text, baseDate);
  const validParsed = parsedList.filter(p => p.isValid);

  if (validParsed.length > 0) {
    const transactionsToSave = validParsed.map(parsed => ({
      type: parsed.type,
      amount: parsed.amount,
      description: parsed.description,
      paymentMode: parsed.paymentMode || 'Cash',
      category: parsed.category,
      sourcePerson: parsed.sourcePerson,
      date: parsed.date
    }));

    saveTransactionsMultiple(transactionsToSave);

    // Clear input
    input.value = '';
    document.getElementById('livePreviewBox').classList.remove('active');
    document.getElementById('addTxBtn').setAttribute('disabled', 'true');
  } else {
    showToast("Could not parse transaction. Please specify amount and item name.", "error");
  }
}

// Pre-fill suggestion NLP query
window.applySuggestion = function(text) {
  const input = document.getElementById('nlpInput');
  if (input) {
    input.value = text;
    // Trigger input event manually
    input.dispatchEvent(new Event('input'));
    input.focus();
  }
};

// Data Backup Engine (JSON & CSV Export/Imports)
function setupBackupAndSync() {
  // Export JSON
  document.getElementById('exportJsonBtn').addEventListener('click', () => {
    const dataStr = JSON.stringify(state.transactions, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `home_expenses_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    
    showToast("JSON backup downloaded successfully!", "success");
  });

  // Export CSV (Excel / Drive Google Sheets compatible)
  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    // Header
    csvContent += "Date,Type,Category,Description,Amount (Rs),Payment Mode,Source Person\n";
    
    // Rows
    state.transactions.forEach(tx => {
      // Clean string fields from commas
      const desc = tx.description.replace(/,/g, ' ');
      const cat = tx.category.replace(/,/g, ' ');
      const pm = (tx.paymentMode || 'Cash').replace(/,/g, ' ');
      const sp = (tx.sourcePerson || '').replace(/,/g, ' ');
      
      csvContent += `${tx.date},${tx.type},${cat},${desc},${tx.amount},${pm},${sp}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const a = document.createElement('a');
    a.href = encodedUri;
    a.download = `home_expenses_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();

    showToast("CSV sheet exported successfully!", "success");
  });

  // Import JSON File
  const fileInput = document.getElementById('importJsonFile');
  const dropzone = document.getElementById('importDropzone');

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--accent-balance)';
    dropzone.style.background = 'rgba(99, 102, 241, 0.08)';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--glass-border)';
    dropzone.style.background = 'rgba(15,22,42,0.2)';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--glass-border)';
    dropzone.style.background = 'rgba(15,22,42,0.2)';
    
    if (e.dataTransfer.files.length > 0) {
      handleImportFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleImportFile(e.target.files[0]);
    }
  });
}

function handleImportFile(file) {
  if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
    showToast("Invalid file type. Please upload a valid JSON backup file.", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const importedData = JSON.parse(e.target.result);
      if (Array.isArray(importedData)) {
        // Simple validations on keys
        const isValidFormat = importedData.every(tx => 
          tx.hasOwnProperty('type') && 
          tx.hasOwnProperty('amount') && 
          tx.hasOwnProperty('description') &&
          tx.hasOwnProperty('date')
        );

        if (isValidFormat) {
          if (confirm(`Do you want to import ${importedData.length} transactions? This will overwrite your current dataset.`)) {
            state.transactions = importedData;
            localStorage.setItem('home_expenses_transactions', JSON.stringify(state.transactions));
            showToast("Backup imported successfully!", "success");
            refreshDashboard();
          }
        } else {
          showToast("JSON format is incorrect. Fields are missing.", "error");
        }
      } else {
        showToast("Backup file must contain a list of transactions.", "error");
      }
    } catch (err) {
      showToast("Error reading file content. Make sure file is valid JSON.", "error");
    }
  };
  reader.readAsText(file);
}

// Theme Manager
function initTheme() {
  const savedTheme = localStorage.getItem('finance_theme') || 'dark';
  setTheme(savedTheme);
  
  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      setTheme(newTheme);
    });
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('finance_theme', theme);
  
  const themeText = document.getElementById('themeToggleText');
  const themeIcon = document.getElementById('themeToggleIcon');
  
  if (themeText && themeIcon) {
    if (theme === 'dark') {
      themeText.innerText = 'Light Theme';
      themeIcon.innerText = '☀️';
    } else {
      themeText.innerText = 'Dark Theme';
      themeIcon.innerText = '🌙';
    }
  }

  updateChartColorsForTheme(theme);
}

function updateChartColorsForTheme(theme) {
  if (typeof Chart === 'undefined') return;
  
  const textColor = theme === 'dark' ? '#94a3b8' : '#475569';
  Chart.defaults.color = textColor;
  
  // Re-draw current charts if active
  if (typeof refreshDashboard === 'function' && state.selectedMonth) {
    refreshDashboard();
  }
}

// Dom Loading triggers
document.addEventListener('DOMContentLoaded', () => {
  initStore();
  initTheme();
  setupMonthSelector();
  setupNlpInput();
  setupBackupAndSync();

  // Navigation tab listeners
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const tab = e.currentTarget.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // Modal manual overrides setup
  const editForm = document.getElementById('editForm');
  const typeField = document.getElementById('formType');
  const categoryField = document.getElementById('formCategory');
  const personRow = document.getElementById('formPersonRow');

  function togglePersonRow() {
    if (typeField.value === 'income' || categoryField.value === 'Lent/Loan') {
      personRow.style.display = 'flex';
    } else {
      personRow.style.display = 'none';
    }
  }

  typeField.addEventListener('change', (e) => {
    updateFormCategories(e.target.value);
    togglePersonRow();
  });

  categoryField.addEventListener('change', () => {
    togglePersonRow();
  });

  editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const txData = {
      date: document.getElementById('formDate').value,
      type: document.getElementById('formType').value,
      amount: parseFloat(document.getElementById('formAmount').value),
      description: document.getElementById('formDesc').value,
      paymentMode: document.getElementById('formPayment').value,
      category: categoryField.value,
      sourcePerson: (typeField.value === 'income' || categoryField.value === 'Lent/Loan') ? document.getElementById('formPerson').value : ''
    };

    saveTransaction(txData);
    closeEditModal();
  });

  // Add listener for filters in table
  document.getElementById('searchTx')?.addEventListener('input', () => refreshDashboard());
  document.getElementById('filterType')?.addEventListener('change', () => refreshDashboard());
  document.getElementById('filterMode')?.addEventListener('change', () => refreshDashboard());

  // Bind Submit Button
  document.getElementById('addTxBtn')?.addEventListener('click', submitNlpTransaction);

  // Set Starting base balance listener
  const setBaseBtn = document.getElementById('setBaseBalanceBtn');
  if (setBaseBtn) {
    setBaseBtn.addEventListener('click', () => {
      const currentBase = localStorage.getItem('base_opening_balance') || '0';
      const newVal = prompt("Enter your initial starting opening balance (Rs):", currentBase);
      if (newVal !== null) {
        const parsed = parseFloat(newVal);
        if (!isNaN(parsed) && parsed >= 0) {
          localStorage.setItem('base_opening_balance', parsed.toString());
          showToast(`Starting balance updated to ₹${parsed.toLocaleString('en-IN')}`, "success");
          refreshDashboard();
        } else {
          showToast("Invalid balance amount. Please enter a valid positive number.", "error");
        }
      }
    });
  }

  // Set initial rendering
  refreshDashboard();
  switchTab('overview');
});
