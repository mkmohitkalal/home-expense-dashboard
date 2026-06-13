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

// ===== Built-in Payment Channels =====
// type: 'asset'     => balance goes UP with income, DOWN with expense (Cash, Prepaid)
// type: 'liability' => outstanding OWES go UP with expense, DOWN with income/payment (Credit Cards)
const BUILTIN_CHANNELS = [
  { key: 'CASH',   name: 'Cash',                         type: 'asset',     emoji: '💵', color: '#10b981', isBuiltin: true, label: 'Physical Balance' },
  { key: 'ICICI',  name: 'ICICI Amazon Pay Credit Card', type: 'liability', emoji: '💳', color: '#ef4444', isBuiltin: true, label: 'Credit Card Dues' },
  { key: 'HDFC',   name: 'HDFC TATA Neu Credit Card',   type: 'liability', emoji: '💳', color: '#f59e0b', isBuiltin: true, label: 'Credit Card Dues' },
  { key: 'GOSATS', name: 'Go Sats Prepaid Debit Card',  type: 'asset',     emoji: '⚡', color: '#6366f1', isBuiltin: true, label: 'Prepaid Balance' },
];

// ===== Custom Channel Helpers =====
function getCustomChannels() {
  try {
    return JSON.parse(localStorage.getItem('custom_payment_channels') || '[]');
  } catch(e) { return []; }
}

function saveCustomChannels(channels) {
  localStorage.setItem('custom_payment_channels', JSON.stringify(channels));
}

function getAllChannels() {
  return [...BUILTIN_CHANNELS, ...getCustomChannels()];
}

// Keep all payment-mode <select> elements in sync with current channel list
function populatePaymentModeSelects() {
  const all = getAllChannels();
  const options = all.map(ch => `<option value="${ch.name}">${ch.name}</option>`).join('');

  // Form modal payment select
  const formPayment = document.getElementById('formPayment');
  if (formPayment) {
    const cur = formPayment.value;
    formPayment.innerHTML = options;
    if ([...formPayment.options].some(o => o.value === cur)) formPayment.value = cur;
  }

  // Filter dropdown in transactions panel
  const filterMode = document.getElementById('filterMode');
  if (filterMode) {
    const curFilter = filterMode.value;
    filterMode.innerHTML = `<option value="all">All Payment Modes</option>` + options;
    if ([...filterMode.options].some(o => o.value === curFilter)) filterMode.value = curFilter;
  }
}

// State persistence and cloud synchronization wrapper
function saveAppState() {
  localStorage.setItem('home_expenses_transactions', JSON.stringify(state.transactions));
  localStorage.setItem('financeflow_last_updated', Date.now().toString());
  
  if (localStorage.getItem('gdrive_sync_enabled') === 'true' && typeof updateCloudFile === 'function') {
    updateCloudFile();
  }
}

function saveBaseBalance(value) {
  localStorage.setItem('base_opening_balance', value.toString());
  localStorage.setItem('financeflow_last_updated', Date.now().toString());
  
  if (localStorage.getItem('gdrive_sync_enabled') === 'true' && typeof updateCloudFile === 'function') {
    updateCloudFile();
  }
}

// Helper: Format Date as YYYY-MM
function getYearMonthString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Data migration/repair helper for past entries
function repairExistingTransactions() {
  let modified = false;

  const invalidNames = ['for', 'to', 'on', 'via', 'using', 'with', 'by', 'in', 'at', 'of', 'from', 'me', 'cash', 'card', 'icici', 'hdfc', 'sats', 'gosats', 'prepaid', 'bank', 'interest', 'salary', 'employer', 'refund', 'electricity', 'bill', 'rent', 'groceries', 'food', 'fuel', 'petrol', 'diesel', 'utility', 'utilities', 'shopping', 'medicine', 'starbucks', 'zomato', 'swiggy', 'uber', 'ola', 'movie', 'netflix', 'wifi', 'internet', 'broadband', 'mobile', 'recharge', 'dth', 'power', 'water', 'gas', 'house', 'flat', 'maid', 'cook', 'maintenance', 'society', 'insurance', 'tax', 'taxes', 'fees', 'school', 'college', 'tuition', 'gift', 'gifts', 'clothes', 'shoes', 'gadget', 'phone', 'laptop', 'device', 'ticket', 'flight', 'train', 'bus', 'hotel', 'dining', 'restaurant', 'cafe', 'pizza', 'burger', 'snacks', 'starbucks', 'starbuck', 'star', 'bucks', 'subway', 'maggi', 'kirana', 'mart', 'supermarket', 'dmart', 'd-mart', 'milk', 'vegetables', 'fruits', 'veg', 'bread', 'eggs', 'laundry', 'washer', 'dryer', 'salary', 'bonus', 'dividend', 'pocket', 'money', 'hand', 'transfer'];

  state.transactions.forEach(tx => {
    // Only repair if the category is Others or not set to avoid overwriting user edits
    const needsRepair = !tx.category || tx.category === 'Others';
    if (!needsRepair) return;

    const desc = tx.description.trim();

    // Check if we can identify a loan name in expense
    if (tx.type === 'expense') {
      const matches = desc.match(/\b(?:lent|gave|sent|paid|loaned)\s+(?:(?:rs\.?|inr|₹|rupees)?\s*\d+(?:\.\d{1,2})?\s*)?(?:to\s+)?([A-Za-z]+)\b/i) ||
                      desc.match(/\b(?:lent|gave|sent|paid|loaned)\s+([A-Za-z]+)\s+(?:(?:rs\.?|inr|₹|rupees)?\s*\d+(?:\.\d{1,2})?)\b/i);

      if (matches) {
        const name = matches[1].trim();
        if (name && !invalidNames.includes(name.toLowerCase())) {
          const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

          if (tx.sourcePerson !== capitalizedName || tx.category !== 'Money Given') {
            tx.sourcePerson = capitalizedName;
            tx.category = 'Money Given';
            if (tx.description.toLowerCase().startsWith('lent') || tx.description.toLowerCase().startsWith('sent') || tx.description.toLowerCase().startsWith('gave') || tx.description.toLowerCase().startsWith('paid')) {
              tx.description = `Gave money to ${capitalizedName}`;
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

          if (tx.sourcePerson !== capitalizedName || tx.category !== 'Money Received Back') {
            tx.sourcePerson = capitalizedName;
            tx.category = 'Money Received Back';
            if (tx.description.toLowerCase().includes('return') || tx.description.toLowerCase().includes('recover') || tx.description.toLowerCase().includes('repaid')) {
              tx.description = `Got money back from ${capitalizedName}`;
            }
            modified = true;
          }
        }
      }
    }
  });

  if (modified) {
    saveAppState();
  }
}

// Migrate old category names to new common-language names
function migrateCategoryNames() {
  const categoryMap = {
    'Lent/Loan': 'Money Given',
    'Loan Repayment': 'Money Returned',
    'Debt Recovery': 'Money Received Back',
    'Borrowed': 'Money Taken'
  };
  
  let migrated = false;
  state.transactions.forEach(tx => {
    if (categoryMap[tx.category]) {
      tx.category = categoryMap[tx.category];
      migrated = true;
    }
  });
  
  if (migrated) {
    saveAppState();
    console.log('Migrated old category names to new common-language names.');
  }
}

// Initialize Application State
function initStore() {
  // Load transactions from localStorage
  const savedTxs = localStorage.getItem('home_expenses_transactions');
  if (savedTxs) {
    try {
      state.transactions = JSON.parse(savedTxs);
      // Migrate old category names to new common-language names
      migrateCategoryNames();
      // Run data migration to populate sourcePerson names for old transactions if empty
      repairExistingTransactions();
    } catch (e) {
      console.error("Error parsing transactions from local storage", e);
      state.transactions = [];
    }
  } else {
    // Start with an empty transaction list for a clean, new dashboard
    state.transactions = [];
    localStorage.setItem('home_expenses_transactions', JSON.stringify([]));
    localStorage.setItem('financeflow_last_updated', '0');
  }

  // Set default selected month to current month
  const today = new Date();
  state.selectedMonth = getYearMonthString(today);

  // Initialize credit card tracker data
  if (typeof loadCreditCardTrackerData === 'function') {
    loadCreditCardTrackerData();
  }
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
  const allChannels = getAllChannels();
  const baseOpeningBalance = parseFloat(localStorage.getItem('base_opening_balance') || '0');

  // Build initial zero-balance maps dynamically
  function makeBalanceMap() {
    const m = {};
    allChannels.forEach(ch => { m[ch.name] = 0; });
    return m;
  }
  function makeFlowMap() {
    const m = {};
    allChannels.forEach(ch => { m[ch.name] = { income: 0, expense: 0 }; });
    return m;
  }

  if (state.transactions.length === 0) {
    const initialBalances = makeBalanceMap();
    const cashCh = allChannels.find(c => c.key === 'CASH');
    if (cashCh) initialBalances[cashCh.name] = baseOpeningBalance;

    const summaries = {};
    summaries[state.selectedMonth] = {
      opening: baseOpeningBalance,
      income: 0,
      expense: 0,
      closing: baseOpeningBalance,
      channels: {
        starting: { ...initialBalances },
        monthly: makeFlowMap(),
        ending: { ...initialBalances }
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

  // Seed running balances — Cash starts with base balance
  let runningBalances = makeBalanceMap();
  const cashCh = allChannels.find(c => c.key === 'CASH');
  if (cashCh) runningBalances[cashCh.name] = baseOpeningBalance;

  for (const m of allMonths) {
    const monthTxs = state.transactions.filter(tx => tx.date.substring(0, 7) === m);

    // Group monthly flows by channel name
    const monthlyFlows = makeFlowMap();
    monthTxs.forEach(tx => {
      const mode = tx.paymentMode || PaymentModes.CASH;
      if (mode in monthlyFlows) {
        if (tx.type === 'income') monthlyFlows[mode].income += tx.amount;
        else                      monthlyFlows[mode].expense += tx.amount;
      }
    });

    const openingBalances = { ...runningBalances };

    // Update running balances based on channel type
    allChannels.forEach(ch => {
      const flow = monthlyFlows[ch.name];
      if (ch.type === 'asset') {
        runningBalances[ch.name] += flow.income - flow.expense;
      } else {
        // liability: outstanding increases with spend, decreases with payment
        runningBalances[ch.name] += flow.expense - flow.income;
      }
    });

    const closingBalances = { ...runningBalances };

    // Net balance = sum of assets − sum of liabilities
    const netBalance = (balMap) => {
      let net = 0;
      allChannels.forEach(ch => {
        net += ch.type === 'asset' ? balMap[ch.name] : -balMap[ch.name];
      });
      return net;
    };

    const income = monthTxs.filter(tx => tx.type === 'income' && tx.category !== 'Money Received Back' && tx.category !== 'Money Taken').reduce((s,tx) => s + tx.amount, 0);
    const expense = monthTxs.filter(tx => tx.type === 'expense' && tx.category !== 'Money Given' && tx.category !== 'Money Returned').reduce((s,tx) => s + tx.amount, 0);

    summaries[m] = {
      opening: netBalance(openingBalances),
      income,
      expense,
      closing: netBalance(closingBalances),
      channels: { starting: openingBalances, monthly: monthlyFlows, ending: closingBalances }
    };
  }

  // If selected month is outside the transaction range
  if (!summaries[state.selectedMonth]) {
    const netNow = getAllChannels().reduce((n,ch) => n + (ch.type === 'asset' ? runningBalances[ch.name] : -runningBalances[ch.name]), 0);
    summaries[state.selectedMonth] = {
      opening: netNow, income: 0, expense: 0, closing: netNow,
      channels: { starting: { ...runningBalances }, monthly: makeFlowMap(), ending: { ...runningBalances } }
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

  // Update mobile balance header value
  const mobileBal = document.getElementById('mobileAvailableBalanceVal');
  if (mobileBal) {
    mobileBal.innerText = `₹${currentSummary.closing.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Calculate total outstanding personal loans up to the selected month
  let totalGiven = 0;
  let totalTaken = 0;
  const tempDebts = {};
  state.transactions.forEach(tx => {
    if (tx.date.substring(0, 7) > state.selectedMonth) return;
    if (!tx.sourcePerson || tx.sourcePerson.trim() === '') return;
    const nameKey = tx.sourcePerson.trim().toLowerCase();
    if (!tempDebts[nameKey]) {
      tempDebts[nameKey] = { given: 0, gotBack: 0, taken: 0, paidBack: 0 };
    }
    if (tx.type === 'expense' && tx.category === 'Money Given') {
      tempDebts[nameKey].given += tx.amount;
    } else if (tx.type === 'income' && tx.category === 'Money Received Back') {
      tempDebts[nameKey].gotBack += tx.amount;
    } else if (tx.type === 'income' && tx.category === 'Money Taken') {
      tempDebts[nameKey].taken += tx.amount;
    } else if (tx.type === 'expense' && tx.category === 'Money Returned') {
      tempDebts[nameKey].paidBack += tx.amount;
    }
  });
  
  Object.values(tempDebts).forEach(d => {
    const outstanding = (d.given - d.gotBack) - (d.taken - d.paidBack);
    if (outstanding > 0) {
      totalGiven += outstanding;
    } else if (outstanding < 0) {
      totalTaken += Math.abs(outstanding);
    }
  });

  const netPersonal = totalGiven - totalTaken;
  const formattedNet = (netPersonal < 0 ? '-' : '') + '₹' + Math.abs(netPersonal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  let netColor = 'var(--accent-carryover)';
  if (netPersonal < 0) {
    netColor = '#a78bfa'; // Purple for net debt
  } else if (netPersonal === 0) {
    netColor = 'var(--text-primary)';
  }

  const lentCardVal = document.getElementById('totalLentVal');
  const lentCardFooter = document.getElementById('totalLentFooter');
  
  if (lentCardVal) {
    lentCardVal.innerText = formattedNet;
    lentCardVal.style.color = netColor;
  }
  if (lentCardFooter) {
    lentCardFooter.style.display = 'block';
    lentCardFooter.style.width = '100%';
    lentCardFooter.innerHTML = `
      <div style="display: flex; gap: 0.5rem; width: 100%; margin-top: 0.4rem;">
        <div style="flex: 1; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.72rem; text-align: center; color: var(--text-secondary);">
          To Receive: <strong style="color: var(--accent-carryover); font-family: monospace;">₹${totalGiven.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </div>
        <div style="flex: 1; background: rgba(139, 92, 246, 0.08); border: 1px solid rgba(139, 92, 246, 0.2); padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.72rem; text-align: center; color: var(--text-secondary);">
          To Pay: <strong style="color: #a78bfa; font-family: monospace;">₹${totalTaken.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </div>
      </div>
    `;
  }

  // Payment Mode details tracking
  renderPaymentModeSummary();
}
function renderPaymentModeSummary() {
  const listElement = document.getElementById('paymentModesList');
  if (!listElement) return;

  const summaries = computeMonthlySummaries();
  const currentSummary = summaries[state.selectedMonth];
  if (!currentSummary || !currentSummary.channels) return;

  const { starting, monthly, ending } = currentSummary.channels;
  const allChannels = getAllChannels();

  listElement.innerHTML = allChannels.map(ch => {
    const startBal = starting[ch.name] ?? 0;
    const flow     = monthly[ch.name]  ?? { income: 0, expense: 0 };
    const endBal   = ending[ch.name]   ?? 0;

    // For assets: balance shown in green. For liabilities: red if owed, green if clear.
    const isLiab = ch.type === 'liability';
    const amtColor = isLiab
      ? (endBal > 0 ? 'var(--accent-expense)' : 'var(--accent-income)')
      : 'var(--accent-income)';

    const subLine = isLiab
      ? `Start: ₹${startBal.toLocaleString('en-IN')} | Spent: ₹${flow.expense.toLocaleString('en-IN')} | Paid: ₹${flow.income.toLocaleString('en-IN')}`
      : `Start: ₹${startBal.toLocaleString('en-IN')} | In: ₹${flow.income.toLocaleString('en-IN')} | Out: ₹${flow.expense.toLocaleString('en-IN')}`;

    const deleteBtn = ch.isBuiltin ? '' : `<button class="delete-channel-btn" onclick="deleteChannel('${ch.key}')" title="Remove channel">✕</button>`;

    return `
      <div class="payment-mode-pill-card" style="--ch-color: ${ch.color}; border-color: ${ch.color}22; background: linear-gradient(135deg, var(--glass-bg), ${ch.color}08);">
        <div class="payment-mode-info">
          <div class="payment-mode-avatar" style="background: ${ch.color}18; color: ${ch.color};">${ch.emoji}</div>
          <div>
            <div class="payment-mode-name" style="display:flex; align-items:center; gap:0.35rem;">
              ${ch.name}
              ${deleteBtn}
            </div>
            <div class="payment-mode-type">${isLiab ? 'Credit Card Dues' : (ch.label || 'Balance')}</div>
          </div>
        </div>
        <div style="text-align: right;">
          <div class="payment-mode-amount" style="color: ${amtColor};">
            ₹${endBal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.15rem;">
            ${subLine}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Calculate and render payment mode summary list

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
      'Money Given': '🤝',
      'Money Returned': '↩️',
      'Money Received Back': '💰',
      'Money Taken': '🤲',
      'Salary': '💼',
      'Personal Transfer': '🤝',
      'Refund': '🔄',
      'Bonus/Interest': '📈',
      'Contribution': '👥',
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
  saveAppState();
  
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
  
  saveAppState();
  showToast(`Added ${txDataArray.length} transactions successfully!`, "success");
  refreshDashboard();
}

// Delete transaction
function deleteTransaction(id) {
  if (confirm("Are you sure you want to delete this transaction?")) {
    state.transactions = state.transactions.filter(t => t.id !== id);
    saveAppState();
    showToast("Transaction deleted successfully!", "success");
    refreshDashboard();
  }
}

// Render Personal Money Tracker for Active Loans & Debts
function renderLentTracker() {
  const trackerPanel = document.getElementById('lentTrackerPanel');
  const listContainer = document.getElementById('lentListContainer');
  if (!trackerPanel || !listContainer) return;

  const selectedMonth = state.selectedMonth;

  // Filter transactions up to the end of the selected month, and exactly in the selected month
  const txsUpToMonth = state.transactions.filter(tx => tx.date.substring(0, 7) <= selectedMonth);
  const txsInMonth = state.transactions.filter(tx => tx.date.substring(0, 7) === selectedMonth);

  const debts = {}; // keyed by name lowercase

  txsUpToMonth.forEach(tx => {
    if (!tx.sourcePerson || tx.sourcePerson.trim() === '') return;
    const name = tx.sourcePerson.trim();
    const nameKey = name.toLowerCase();

    if (!debts[nameKey]) {
      debts[nameKey] = {
        name: name,
        given: 0,
        gotBack: 0,
        taken: 0,
        paidBack: 0,
        hasTxInMonth: false
      };
    }

    if (tx.type === 'expense' && tx.category === 'Money Given') {
      debts[nameKey].given += tx.amount;
    } else if (tx.type === 'income' && tx.category === 'Money Received Back') {
      debts[nameKey].gotBack += tx.amount;
    } else if (tx.type === 'income' && tx.category === 'Money Taken') {
      debts[nameKey].taken += tx.amount;
    } else if (tx.type === 'expense' && tx.category === 'Money Returned') {
      debts[nameKey].paidBack += tx.amount;
    }
  });

  // Mark if they have active transactions in the current selected month
  txsInMonth.forEach(tx => {
    if (!tx.sourcePerson || tx.sourcePerson.trim() === '') return;
    const nameKey = tx.sourcePerson.trim().toLowerCase();
    if (debts[nameKey]) {
      debts[nameKey].hasTxInMonth = true;
    }
  });

  // Filter criteria:
  // Show card if there is any history (given > 0 or taken > 0) AND (still has outstanding, OR has transaction this month)
  const activeDebts = Object.values(debts).filter(d => {
    const outstanding = (d.given - d.gotBack) - (d.taken - d.paidBack);
    return (d.given > 0 || d.taken > 0) && (outstanding !== 0 || d.hasTxInMonth);
  });

  // Show panel if we are on the overview tab
  const showTracker = state.activeTab === 'overview';
  trackerPanel.style.display = showTracker ? 'block' : 'none';

  if (!showTracker) return;

  if (activeDebts.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state" style="padding: 2rem 1rem; width: 100%; grid-column: 1 / -1; background: var(--card-bg-subtle); border: 1px dashed var(--glass-border); border-radius: var(--radius-md);">
        <div class="empty-state-icon" style="font-size: 2rem; opacity: 0.3;">🤝</div>
        <p style="font-weight: 500; color: var(--text-secondary); margin-top: 0.5rem;">No money given or taken from anyone yet.</p>
        <p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.25rem;">
          Try typing: <strong>"gave 5000 to Amit"</strong> or <strong>"borrowed 3000 from Rahul"</strong> in the smart input box above.
        </p>
      </div>
    `;
    return;
  }

  // Update header title to reflect both loans and debts
  const headerSpan = trackerPanel.querySelector('.panel-header h2');
  if (headerSpan) {
    headerSpan.innerHTML = `<span>🤝</span> Money Given & Taken`;
  }

  listContainer.innerHTML = activeDebts.map(d => {
    const outstanding = (d.given - d.gotBack) - (d.taken - d.paidBack);
    const theyOweUs = outstanding > 0;
    const isSettled = outstanding === 0;
    
    let statusText = '';
    let statusClass = '';
    let outstandingText = '';
    
    if (isSettled) {
      statusText = 'All Settled ✅';
      statusClass = 'settled';
      outstandingText = 'Settled 🎉';
    } else if (theyOweUs) {
      statusText = 'They owe you';
      statusClass = 'active';
      outstandingText = `To Receive: ₹${outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    } else {
      statusText = 'You owe them';
      statusClass = 'debt';
      outstandingText = `To Pay: ₹${Math.abs(outstanding).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    }

    const initials = d.name.substring(0, 2).toUpperCase();

    // Show breakdown sub-labels depending on what exists, styled in distinct boxes
    let givenBreakdown = '';
    if (d.given > 0 || d.gotBack > 0) {
      givenBreakdown = `
        <div class="lent-amount-item" style="background: rgba(245, 158, 11, 0.04); border: 1px solid rgba(245, 158, 11, 0.15); padding: 0.5rem 0.75rem; border-radius: 8px;">
          <div class="lent-amount-label" style="font-size: 0.68rem; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.25rem;">Given / Got Back</div>
          <div class="lent-amount-val" style="font-size:0.85rem; font-weight: 600; color: var(--text-primary);">₹${d.given.toLocaleString('en-IN')} / <span style="color:var(--accent-income);">₹${d.gotBack.toLocaleString('en-IN')}</span></div>
        </div>
      `;
    }
    
    let takenBreakdown = '';
    if (d.taken > 0 || d.paidBack > 0) {
      takenBreakdown = `
        <div class="lent-amount-item" style="background: rgba(139, 92, 246, 0.04); border: 1px solid rgba(139, 92, 246, 0.15); padding: 0.5rem 0.75rem; border-radius: 8px;">
          <div class="lent-amount-label" style="font-size: 0.68rem; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.25rem;">Taken / Paid Back</div>
          <div class="lent-amount-val" style="font-size:0.85rem; font-weight: 600; color: var(--text-primary);">₹${d.taken.toLocaleString('en-IN')} / <span style="color:var(--accent-income);">₹${d.paidBack.toLocaleString('en-IN')}</span></div>
        </div>
      `;
    }

    // Add progress bars for repayment/recovery tracking
    let progressSection = '';
    if (theyOweUs && d.given > 0) {
      const progress = Math.min(100, Math.max(0, (d.gotBack / d.given) * 100));
      progressSection = `
        <div class="lent-progress-section" style="margin-top: 0.5rem; width: 100%;">
          <div style="display:flex; justify-content:space-between; font-size:0.72rem; margin-bottom:0.25rem;">
            <span style="color:var(--text-secondary);">Getting Back</span>
            <span style="font-weight:600; color:var(--text-primary);">${Math.round(progress)}%</span>
          </div>
          <div class="lent-progress-bar-bg">
            <div class="lent-progress-bar-fill" style="width: ${progress}%;"></div>
          </div>
        </div>
      `;
    } else if (!theyOweUs && !isSettled && d.taken > 0) {
      const progress = Math.min(100, Math.max(0, (d.paidBack / d.taken) * 100));
      progressSection = `
        <div class="lent-progress-section" style="margin-top: 0.5rem; width: 100%;">
          <div style="display:flex; justify-content:space-between; font-size:0.72rem; margin-bottom:0.25rem;">
            <span style="color:var(--text-secondary);">Paying Back</span>
            <span style="font-weight:600; color:var(--text-primary);">${Math.round(progress)}%</span>
          </div>
          <div class="lent-progress-bar-bg">
            <div class="lent-progress-bar-fill" style="width: ${progress}%; background: linear-gradient(90deg, #8b5cf6, #a78bfa);"></div>
          </div>
        </div>
      `;
    }

    const gridCols = (givenBreakdown && takenBreakdown) ? 'grid-template-columns: 1fr 1fr;' : 'grid-template-columns: 1fr;';

    return `
      <div class="lent-card ${isSettled ? 'settled' : theyOweUs ? '' : 'debt-mode'}">
        <div class="lent-card-header">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div class="lent-avatar" style="${theyOweUs ? '' : 'background: rgba(139, 92, 246, 0.15); color: #8b5cf6; border-color: rgba(139, 92, 246, 0.3);'}">${initials}</div>
            <div class="lent-person-details">
              <div class="lent-name">${d.name}</div>
              <div class="lent-sub ${statusClass}">${statusText}</div>
            </div>
          </div>
          <div class="lent-outstanding-badge ${statusClass}">
            ${outstandingText}
          </div>
        </div>
        <div class="lent-amounts" style="gap: 1rem; margin-bottom: 0.5rem; display: grid; ${gridCols}">
          ${givenBreakdown}
          ${takenBreakdown}
        </div>
        ${progressSection}
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

  // Refresh Credit Cards if loaded
  if (typeof renderCreditCardDashboard === 'function') {
    renderCreditCardDashboard();
  }

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

  // Show/hide Home Expense dashboard header and stats grid depending on tab
  const topHeader = document.getElementById('mainTopHeader');
  const statsGrid = document.getElementById('mainStatsGrid');
  const btnHome = document.getElementById('dbToggleHome');
  const btnCc = document.getElementById('dbToggleCc');
  const appContainer = document.querySelector('.app-container');

  if (tabName === 'credit-cards') {
    state.activeDashboard = 'credit-card';
    if (appContainer) appContainer.classList.add('cc-active');
    
    // Change heading and description text for Credit Cards
    const heading = document.getElementById('mainHeading');
    if (heading) heading.innerText = 'Mohit Credit card Dashboard';
    const desc = document.getElementById('mainDesc');
    if (desc) desc.innerText = 'Track outstanding credit card limits, cycles, and ledger details.';
    
    if (statsGrid) statsGrid.classList.add('hidden');
    if (btnHome) {
      btnHome.classList.remove('active');
      btnHome.style.removeProperty('--card-theme-color');
    }
    if (btnCc) {
      btnCc.classList.add('active');
      btnCc.style.setProperty('--card-theme-color', 'var(--primary)');
    }
    // Hide sidebar menu links on Credit Cards active
    const navMenu = document.querySelector('.nav-menu');
    if (navMenu) navMenu.classList.add('hidden');
    const mobileNav = document.querySelector('.mobile-nav-bar');
    if (mobileNav) mobileNav.classList.add('hidden');
  } else {
    state.activeDashboard = 'home';
    if (appContainer) appContainer.classList.remove('cc-active');
    
    // Restore heading and description text for Home Expense Dashboard
    const heading = document.getElementById('mainHeading');
    if (heading) heading.innerText = 'Home Expense Dashboard';
    const desc = document.getElementById('mainDesc');
    if (desc) desc.innerText = 'Easily manage monthly savings, cash, credit cards, and carryover flows.';
    
    if (statsGrid) statsGrid.classList.remove('hidden');
    if (btnHome) {
      btnHome.classList.add('active');
      btnHome.style.setProperty('--card-theme-color', 'var(--primary)');
    }
    if (btnCc) {
      btnCc.classList.remove('active');
      btnCc.style.removeProperty('--card-theme-color');
    }
    // Show sidebar menu links
    const navMenu = document.querySelector('.nav-menu');
    if (navMenu) navMenu.classList.remove('hidden');
    const mobileNav = document.querySelector('.mobile-nav-bar');
    if (mobileNav) mobileNav.classList.remove('hidden');
  }

  const ccPanel = document.getElementById('creditCardPanel');
  if (ccPanel) {
    ccPanel.style.display = tabName === 'credit-cards' ? 'block' : 'none';
  }

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
  } else if (tabName === 'credit-cards') {
    document.getElementById('backupPanel').style.display = 'none';
    txTablePanel.style.display = 'none';
    renderCreditCardDashboard();
  } else {
    // Analytics or Overview
    document.getElementById('backupPanel').style.display = 'none';
    // Show the ledger on overview, hide on analytics
    txTablePanel.style.display = tabName === 'overview' ? 'flex' : 'none';
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
  
  // Toggle source person display based on type or Money categories
  const moneyCategories = ['Money Given', 'Money Returned', 'Money Received Back', 'Money Taken'];
  if (tx.type === 'income' || moneyCategories.includes(tx.category)) {
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
            saveAppState();
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

  const moneyCategories = ['Money Given', 'Money Returned', 'Money Received Back', 'Money Taken'];

  function togglePersonRow() {
    if (typeField.value === 'income' || moneyCategories.includes(categoryField.value)) {
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
      sourcePerson: (typeField.value === 'income' || moneyCategories.includes(categoryField.value)) ? document.getElementById('formPerson').value : ''
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

  // Bind the Add Channel "+" button
  const addChannelBtn = document.getElementById('addChannelBtn');
  if (addChannelBtn) {
    addChannelBtn.addEventListener('click', openAddChannelModal);
  }

  // Populate all payment mode selects on load
  populatePaymentModeSelects();

  // Set Starting base balance listener
  const setBaseBtn = document.getElementById('setBaseBalanceBtn');
  if (setBaseBtn) {
    setBaseBtn.addEventListener('click', () => {
      const currentBase = localStorage.getItem('base_opening_balance') || '0';
      const newVal = prompt("Enter your initial starting opening balance (Rs):", currentBase);
      if (newVal !== null) {
        const parsed = parseFloat(newVal);
        if (!isNaN(parsed) && parsed >= 0) {
          saveBaseBalance(parsed);
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

// ========== Add Payment Channel Modal Controller ==========

let _chSelectedType  = 'asset';
let _chSelectedEmoji = '💳';
let _chSelectedColor = '#6366f1';

function openAddChannelModal() {
  // Reset form state
  document.getElementById('chNameInput').value = '';
  _chSelectedType  = 'asset';
  _chSelectedEmoji = '💳';
  _chSelectedColor = '#6366f1';

  // Reset type buttons
  document.getElementById('chTypeAsset').classList.add('active');
  document.getElementById('chTypeLiab').classList.remove('active');

  // Reset emoji selection
  document.querySelectorAll('.emoji-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.emoji === _chSelectedEmoji);
  });

  // Reset color selection
  document.querySelectorAll('.color-swatch').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === _chSelectedColor);
  });

  document.getElementById('addChannelModal').classList.add('active');
}

function closeAddChannelModal() {
  document.getElementById('addChannelModal').classList.remove('active');
}

function selectChannelType(type) {
  _chSelectedType = type;
  const assetBtn = document.getElementById('chTypeAsset');
  const liabBtn  = document.getElementById('chTypeLiab');
  if (type === 'asset') {
    assetBtn.classList.add('active');
    assetBtn.classList.remove('liability');
    liabBtn.classList.remove('active');
  } else {
    liabBtn.classList.add('active');
    assetBtn.classList.remove('active');
  }
}

function selectChannelEmoji(el) {
  _chSelectedEmoji = el.dataset.emoji;
  document.querySelectorAll('.emoji-option').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
}

function selectChannelColor(el) {
  _chSelectedColor = el.dataset.color;
  document.querySelectorAll('.color-swatch').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
}

function saveNewChannel() {
  const name = document.getElementById('chNameInput').value.trim();
  if (!name) {
    showToast("Please enter a channel name.", "error");
    return;
  }

  // Check for duplicates
  const existing = getAllChannels();
  if (existing.some(ch => ch.name.toLowerCase() === name.toLowerCase())) {
    showToast("A channel with this name already exists.", "error");
    return;
  }

  // Create a unique key from the name
  const key = 'custom_' + name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now();

  const newChannel = {
    key,
    name,
    type:      _chSelectedType,
    emoji:     _chSelectedEmoji,
    color:     _chSelectedColor,
    isBuiltin: false,
    label:     _chSelectedType === 'asset' ? 'Balance' : 'Credit Card Dues'
  };

  const customs = getCustomChannels();
  customs.push(newChannel);
  saveCustomChannels(customs);

  closeAddChannelModal();
  populatePaymentModeSelects();
  refreshDashboard();
  showToast(`✅ "${name}" added as a payment channel!`, "success");
}

window.deleteChannel = function(key) {
  if (!confirm("Remove this payment channel? Existing transactions using it will not be deleted.")) return;
  let customs = getCustomChannels();
  customs = customs.filter(ch => ch.key !== key);
  saveCustomChannels(customs);
  populatePaymentModeSelects();
  refreshDashboard();
  showToast("Channel removed.", "success");
};

// Close modal on overlay click
document.getElementById('addChannelModal')?.addEventListener('click', function(e) {
  if (e.target === this) closeAddChannelModal();
});


/* ==========================================================================
   CREDIT CARDS EXPENSE TRACKER FUNCTIONALITY
   ========================================================================== */

// Predefined themes
window.adjustColorBrightness = function(hex, percent) {
  let R = parseInt(hex.substring(1, 3), 16);
  let G = parseInt(hex.substring(3, 5), 16);
  let B = parseInt(hex.substring(5, 7), 16);
  R = parseInt(R * (100 + percent) / 100);
  G = parseInt(G * (100 + percent) / 100);
  B = parseInt(B * (100 + percent) / 100);
  R = (R < 255) ? R : 255;
  G = (G < 255) ? G : 255;
  B = (B < 255) ? B : 255;
  R = (R > 0) ? R : 0;
  G = (G > 0) ? G : 0;
  B = (B > 0) ? B : 0;
  const rHex = R.toString(16).padStart(2, '0');
  const gHex = G.toString(16).padStart(2, '0');
  const bHex = B.toString(16).padStart(2, '0');
  return `#${rHex}${gHex}${bHex}`;
};

function formatCcCurrency(amount) {
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 1. Data Store Operations
window.loadCreditCardTrackerData = function() {
  const defaultData = {
    cards: [
      { id: 'card-amazon-icici', name: 'Amazon ICICI Credit Card', network: 'Visa', color: '#ff9900', limit: 150000, billingCycle: 15, last4: '4321' },
      { id: 'card-hdfc-tata-neu', name: 'HDFC Tata Neu Credit Card', network: 'RuPay', color: '#1a3a8f', limit: 200000, billingCycle: 20, last4: '8888' },
      { id: 'card-yes-ace', name: 'Yes Bank Ace Credit Card', network: 'Visa', color: '#0066b2', limit: 120000, billingCycle: 10, last4: '5555' }
    ],
    expenses: []
  };

  try {
    const raw = localStorage.getItem('credit_card_tracker_data');
    if (raw) {
      const data = JSON.parse(raw);
      state.creditCards = data.cards || defaultData.cards;
      state.creditCardExpenses = data.expenses || defaultData.expenses;
    } else {
      state.creditCards = defaultData.cards;
      state.creditCardExpenses = defaultData.expenses;
      saveCreditCardTrackerData();
    }
  } catch (e) {
    console.error("Error loading credit card data:", e);
    state.creditCards = defaultData.cards;
    state.creditCardExpenses = defaultData.expenses;
  }

  if (state.creditCards.length > 0 && !state.selectedCreditCardId) {
    state.selectedCreditCardId = state.creditCards[0].id;
  }
};

window.saveCreditCardTrackerData = function() {
  const data = {
    cards: state.creditCards,
    expenses: state.creditCardExpenses
  };
  localStorage.setItem('credit_card_tracker_data', JSON.stringify(data));
  localStorage.setItem('financeflow_last_updated', Date.now().toString());
};

// 2. Active Tab UI Rendering
window.renderCreditCardDashboard = function() {
  const container = document.getElementById('creditCardPanel');
  if (!container || state.activeTab !== 'credit-cards') return;

  const subnav = document.getElementById('ccSubnav');
  const emptyState = document.getElementById('ccEmptyState');
  const workspace = document.getElementById('ccWorkspace');

  if (!state.creditCards || state.creditCards.length === 0) {
    if (subnav) subnav.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    if (workspace) workspace.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (workspace) workspace.style.display = 'block';

  // Make sure we have a valid selection
  if (!state.selectedCreditCardId || !state.creditCards.some(c => c.id === state.selectedCreditCardId)) {
    state.selectedCreditCardId = state.creditCards[0].id;
  }

  const activeCard = state.creditCards.find(c => c.id === state.selectedCreditCardId);

  // Render Subnav Buttons
  if (subnav) {
    subnav.innerHTML = state.creditCards.map(card => {
      const isActive = card.id === state.selectedCreditCardId;
      const themeColor = card.color || '#6366f1';
      const cardExpenses = state.creditCardExpenses.filter(e => e.cardId === card.id);
      
      const cardOutstandingExpenses = cardExpenses.filter(e => e.type !== 'refund' && (e.status === 'Unbilled' || e.status === 'Billed')).reduce((sum, e) => sum + e.amount, 0);
      const cardOutstandingRefunds = cardExpenses.filter(e => e.type === 'refund' && (e.status === 'Unbilled' || e.status === 'Billed')).reduce((sum, e) => sum + e.amount, 0);
      const cardOutstanding = cardOutstandingExpenses - cardOutstandingRefunds;
      const formattedTotal = formatCcCurrency(cardOutstanding);
      
      return `
        <button class="cc-subnav-btn ${isActive ? 'active' : ''}" 
                style="${isActive ? `--card-theme-color: ${themeColor}` : ''}"
                onclick="selectCcCard('${card.id}')">
          💳 ${card.name} (${card.last4}) • ${formattedTotal}
        </button>
      `;
    }).join('');
  }

  // Update Visual Card mockup
  const cardElement = document.getElementById('ccVisualCard');
  if (cardElement && activeCard) {
    const endColor = adjustColorBrightness(activeCard.color, -35);
    cardElement.style.setProperty('--card-color-start', activeCard.color);
    cardElement.style.setProperty('--card-color-end', endColor);
    
    document.getElementById('ccVisualCardName').innerText = activeCard.name;
    document.getElementById('ccVisualCardNetwork').innerText = activeCard.network.toUpperCase();
    document.getElementById('ccVisualCardNumber').innerText = `•••• •••• •••• ${activeCard.last4}`;
    document.getElementById('ccVisualCardCycle').innerText = `${activeCard.billingCycle}th`;
  }

  // Calculate Metrics
  const expenses = state.creditCardExpenses.filter(e => e.cardId === state.selectedCreditCardId);
  
  const unbilledExpenses = expenses.filter(e => e.status === 'Unbilled' && e.type !== 'refund').reduce((sum, e) => sum + e.amount, 0);
  const unbilledRefunds = expenses.filter(e => e.status === 'Unbilled' && e.type === 'refund').reduce((sum, e) => sum + e.amount, 0);
  const unbilled = unbilledExpenses - unbilledRefunds;

  const billedExpenses = expenses.filter(e => e.status === 'Billed' && e.type !== 'refund').reduce((sum, e) => sum + e.amount, 0);
  const billedRefunds = expenses.filter(e => e.status === 'Billed' && e.type === 'refund').reduce((sum, e) => sum + e.amount, 0);
  const billed = billedExpenses - billedRefunds;

  const outstanding = unbilled + billed;

  // Render Outstanding Dues
  document.getElementById('ccOutstandingVal').innerText = formatCcCurrency(outstanding);
  document.getElementById('ccBilledUnbilledSplit').innerText = `${formatCcCurrency(billed)} Billed | ${formatCcCurrency(unbilled)} Unbilled`;

  // Calculate & Render Combined Dues
  const combinedExpenses = state.creditCardExpenses.filter(e => e.type !== 'refund' && (e.status === 'Unbilled' || e.status === 'Billed')).reduce((sum, e) => sum + e.amount, 0);
  const combinedRefunds = state.creditCardExpenses.filter(e => e.type === 'refund' && (e.status === 'Unbilled' || e.status === 'Billed')).reduce((sum, e) => sum + e.amount, 0);
  const combinedOutstanding = combinedExpenses - combinedRefunds;
  
  const combinedOutstandingValEl = document.getElementById('ccCombinedOutstandingVal');
  if (combinedOutstandingValEl) {
    combinedOutstandingValEl.innerText = formatCcCurrency(combinedOutstanding);
  }

  // Render Limit Utilization
  if (activeCard) {
    const limit = activeCard.limit || 100000;
    const percent = Math.min(100, Math.max(0, Math.round((outstanding / limit) * 100)));
    document.getElementById('ccLimitPercentVal').innerText = `${percent}%`;
    
    const fill = document.getElementById('ccLimitBarFill');
    if (fill) {
      fill.style.width = `${percent}%`;
      // Warn user if utilization is high
      if (percent > 85) {
        fill.style.background = 'var(--accent-expense)';
      } else if (percent > 65) {
        fill.style.background = '#f59e0b';
      } else {
        fill.style.background = 'var(--accent-balance)';
      }
    }
    document.getElementById('ccLimitDetailsVal').innerText = `${formatCcCurrency(outstanding)} used of ${formatCcCurrency(limit)} limit`;
  }

  // Render Billing Cycle Countdown
  if (activeCard) {
    const today = new Date();
    const currentDay = today.getDate();
    const cycleDay = activeCard.billingCycle;
    
    // Calculate statement and due dates
    let statementDate = new Date(today.getFullYear(), today.getMonth(), cycleDay);
    if (currentDay >= cycleDay) {
      // statement for this month already generated, next is next month
      statementDate.setMonth(statementDate.getMonth() + 1);
    }
    
    // Days until statement
    const diffTime = Math.abs(statementDate - today);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Due Date calculation (typically 20 days after statement)
    const dueDate = new Date(statementDate);
    dueDate.setDate(dueDate.getDate() + 20);

    const dueDayFormatted = dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    const billDayFormatted = statementDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

    document.getElementById('ccBillingCycleVal').innerText = `Bill Date: ${cycleDay}th`;
    document.getElementById('ccBillingCycleDetails').innerText = `Next statement: ${billDayFormatted} (in ${diffDays} days). Payment due approx. ${dueDayFormatted}.`;
  }

  // Populate Categories Filter once
  populateCcCategoryFilterOptions();

  // Render ledger table
  renderCcExpenses();

  // Render splits panel
  renderCcSplits();
};

window.selectCcCard = function(cardId) {
  state.selectedCreditCardId = cardId;
  renderCreditCardDashboard();
};

// 3. Category Filter Populator
function populateCcCategoryFilterOptions() {
  const select = document.getElementById('ccCategoryFilter');
  if (!select) return;
  
  // Cache current selection
  const currentVal = select.value;
  
  const categories = ['Shopping', 'Dining', 'Utilities', 'Fuel', 'Travel', 'Groceries', 'Others'];
  select.innerHTML = '<option value="all">All Categories</option>' + 
    categories.map(c => `<option value="${c}">${c}</option>`).join('');
    
  select.value = currentVal;
}

// 4. Render Ledger Table
window.renderCcExpenses = function() {
  const tableBody = document.getElementById('ccTxTableBody');
  if (!tableBody || !state.selectedCreditCardId) return;

  const searchVal = (document.getElementById('ccSearchInput')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('ccStatusFilter')?.value || 'all';
  const categoryFilter = document.getElementById('ccCategoryFilter')?.value || 'all';

  let filtered = state.creditCardExpenses.filter(e => e.cardId === state.selectedCreditCardId);

  // Apply filters
  if (searchVal) {
    filtered = filtered.filter(e => e.description.toLowerCase().includes(searchVal));
  }
  if (statusFilter !== 'all') {
    filtered = filtered.filter(e => e.status === statusFilter);
  }
  if (categoryFilter !== 'all') {
    filtered = filtered.filter(e => e.category === categoryFilter);
  }

  // Sort by date descending
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
          No transactions found for this card matching filters.
        </td>
      </tr>
    `;
    return;
  }

  const categoryEmojis = {
    'Shopping': '🛍️',
    'Dining': '🍽️',
    'Utilities': '💡',
    'Fuel': '⛽',
    'Travel': '✈️',
    'Groceries': '🛒',
    'Others': '📦'
  };

  tableBody.innerHTML = filtered.map(tx => {
    const statusClass = tx.status === 'Unbilled' ? 'status-unbilled' : 
                        tx.status === 'Billed' ? 'status-billed' : 'status-paid';
    
    const formattedDate = new Date(tx.date).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: '2-digit'
    });

    let paidForText = '';
    if (tx.sourcePerson) {
      if (tx.splitSettled) {
        paidForText = ` <span style="font-size: 0.85rem; color: var(--text-muted); text-decoration: line-through;">(Paid for ${tx.sourcePerson} - Settled)</span>`;
      } else {
        paidForText = ` <span style="font-size: 0.85rem; color: var(--accent-income); font-weight: 600;">(Paid for ${tx.sourcePerson})</span>`;
      }
    }

    const isRefund = tx.type === 'refund';
    const amountColor = isRefund ? 'var(--accent-income)' : 'var(--accent-expense)';
    const amountDisplay = isRefund ? `- ${formatCcCurrency(tx.amount)}` : formatCcCurrency(tx.amount);

    return `
      <tr>
        <td style="font-family: monospace;">${formattedDate}</td>
        <td style="font-weight: 600; color: var(--text-primary);">${tx.description}${paidForText}</td>
        <td>${categoryEmojis[tx.category] || '📦'} ${tx.category}</td>
        <td style="font-weight: 700; color: ${amountColor}; font-family: monospace;">
          ${amountDisplay}
        </td>
        <td>
          <span class="status-tag ${statusClass}" style="cursor: pointer;" onclick="cycleCcStatus('${tx.id}')">
            ${tx.status}
          </span>
        </td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 0.4rem; justify-content: center;">
            <button class="btn btn-secondary btn-xs" style="padding: 0.2rem 0.4rem; font-size: 0.7rem;" onclick="openEditCcExpenseModal('${tx.id}')">✏️</button>
            <button class="btn btn-secondary btn-xs" style="padding: 0.2rem 0.4rem; font-size: 0.7rem; color: var(--accent-expense); border-color: rgba(239,68,68,0.2);" onclick="deleteCcExpense('${tx.id}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
};

// Toggle Transaction Status
window.cycleCcStatus = function(txId) {
  const tx = state.creditCardExpenses.find(e => e.id === txId);
  if (!tx) return;

  const order = ['Unbilled', 'Billed', 'Paid'];
  const nextIdx = (order.indexOf(tx.status) + 1) % order.length;
  tx.status = order[nextIdx];

  saveCreditCardTrackerData();
  renderCreditCardDashboard();
  showToast(`Transaction marked as ${tx.status}`, "success");
};

// 5. Add/Edit Card Modals
window.openAddCardModal = function() {
  document.getElementById('ccModalTitle').innerText = '➕ Add Credit Card';
  document.getElementById('ccCardIdInput').value = '';
  document.getElementById('ccNameInput').value = '';
  document.getElementById('ccNetworkInput').value = 'Visa';
  document.getElementById('ccLast4Input').value = '';
  document.getElementById('ccLimitInput').value = '';
  document.getElementById('ccCycleInput').value = '';
  document.getElementById('ccCardSubmitBtn').innerText = 'Add Card';
  
  // Set default color
  selectCcCardColor(document.querySelector('#ccColorPicker .color-swatch'));

  document.getElementById('addCardModal').classList.add('active');
};

window.openEditCardModal = function() {
  const card = state.creditCards.find(c => c.id === state.selectedCreditCardId);
  if (!card) return;

  document.getElementById('ccModalTitle').innerText = '✏️ Edit Credit Card';
  document.getElementById('ccCardIdInput').value = card.id;
  document.getElementById('ccNameInput').value = card.name;
  document.getElementById('ccNetworkInput').value = card.network;
  document.getElementById('ccLast4Input').value = card.last4;
  document.getElementById('ccLimitInput').value = card.limit;
  document.getElementById('ccCycleInput').value = card.billingCycle;
  document.getElementById('ccCardSubmitBtn').innerText = 'Save Changes';

  // Highlight color
  const swatch = Array.from(document.querySelectorAll('#ccColorPicker .color-swatch'))
    .find(s => s.getAttribute('data-color') === card.color);
  if (swatch) {
    selectCcCardColor(swatch);
  } else {
    document.getElementById('ccColorInput').value = card.color;
  }

  document.getElementById('addCardModal').classList.add('active');
};

window.closeAddCardModal = function() {
  document.getElementById('addCardModal').classList.remove('active');
};

window.selectCcCardColor = function(swatchElement) {
  if (!swatchElement) return;
  document.querySelectorAll('#ccColorPicker .color-swatch').forEach(s => s.classList.remove('selected'));
  swatchElement.classList.add('selected');
  document.getElementById('ccColorInput').value = swatchElement.getAttribute('data-color');
};

window.saveCreditCardForm = function(event) {
  event.preventDefault();

  const id = document.getElementById('ccCardIdInput').value;
  const name = document.getElementById('ccNameInput').value.trim();
  const network = document.getElementById('ccNetworkInput').value;
  const last4 = document.getElementById('ccLast4Input').value.trim();
  const limit = parseFloat(document.getElementById('ccLimitInput').value);
  const cycle = parseInt(document.getElementById('ccCycleInput').value, 10);
  const color = document.getElementById('ccColorInput').value;

  if (id) {
    // Edit Mode
    const card = state.creditCards.find(c => c.id === id);
    if (card) {
      card.name = name;
      card.network = network;
      card.last4 = last4;
      card.limit = limit;
      card.billingCycle = cycle;
      card.color = color;
      showToast(`Card details updated!`, "success");
    }
  } else {
    // Add Mode
    const newCard = {
      id: 'card-' + Date.now(),
      name, network, last4, limit, billingCycle: cycle, color
    };
    state.creditCards.push(newCard);
    state.selectedCreditCardId = newCard.id;
    showToast(`"${name}" added successfully!`, "success");
  }

  saveCreditCardTrackerData();
  closeAddCardModal();
  renderCreditCardDashboard();
};

window.deleteActiveCard = function() {
  if (!state.selectedCreditCardId) return;
  const card = state.creditCards.find(c => c.id === state.selectedCreditCardId);
  if (!card) return;

  if (!confirm(`Are you sure you want to delete "${card.name}"?\nThis will permanently delete all logged transactions for this card.`)) return;

  state.creditCards = state.creditCards.filter(c => c.id !== state.selectedCreditCardId);
  state.creditCardExpenses = state.creditCardExpenses.filter(e => e.cardId !== state.selectedCreditCardId);

  state.selectedCreditCardId = state.creditCards.length > 0 ? state.creditCards[0].id : null;

  saveCreditCardTrackerData();
  renderCreditCardDashboard();
  showToast("Credit Card and its ledger deleted.", "success");
};

// Helper to sync CC expense modal titles/buttons depending on selected transaction type
window.syncCcExpenseModalType = function() {
  const typeSelect = document.getElementById('ccExpenseType');
  if (!typeSelect) return;
  const type = typeSelect.value;
  const isEdit = !!document.getElementById('ccExpenseIdInput').value;
  if (isEdit) {
    document.getElementById('ccExpenseModalTitle').innerText = type === 'refund' ? '✏️ Edit Card Refund' : '✏️ Edit Card Expense';
    document.getElementById('ccExpenseSubmitBtn').innerText = type === 'refund' ? 'Save Refund' : 'Save Changes';
  } else {
    document.getElementById('ccExpenseModalTitle').innerText = type === 'refund' ? '➕ Add Card Refund' : '➕ Add Card Expense';
    document.getElementById('ccExpenseSubmitBtn').innerText = type === 'refund' ? 'Add Refund' : 'Add Expense';
  }
};

// 6. Expense Form Modals
window.openAddCcExpenseModal = function(modeOrId = 'expense') {
  const form = document.getElementById('ccExpenseForm');
  if (!form) return;

  let isEdit = false;
  let tx = null;
  let type = 'expense';

  if (modeOrId && modeOrId !== 'expense' && modeOrId !== 'refund') {
    isEdit = true;
    tx = state.creditCardExpenses.find(e => e.id === modeOrId);
    if (!tx) return;
    type = tx.type || 'expense';
  } else {
    type = modeOrId || 'expense';
  }

  const typeSelect = document.getElementById('ccExpenseType');
  if (typeSelect) {
    typeSelect.value = type;
  }

  if (isEdit) {
    document.getElementById('ccExpenseIdInput').value = tx.id;
    document.getElementById('ccExpenseDate').value = tx.date;
    document.getElementById('ccExpenseAmount').value = tx.amount;
    document.getElementById('ccExpenseDesc').value = tx.description;
    document.getElementById('ccExpenseCategory').value = tx.category;
    document.getElementById('ccExpenseStatus').value = tx.status;
    document.getElementById('ccExpensePerson').value = tx.sourcePerson || '';
  } else {
    document.getElementById('ccExpenseIdInput').value = '';
    document.getElementById('ccExpenseDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('ccExpenseAmount').value = '';
    document.getElementById('ccExpenseDesc').value = '';
    document.getElementById('ccExpenseCategory').value = 'Others';
    document.getElementById('ccExpenseStatus').value = 'Unbilled';
    document.getElementById('ccExpensePerson').value = '';
  }

  // Sync titles and submit button labels
  syncCcExpenseModalType();

  document.getElementById('addCcExpenseModal').classList.add('active');
};

window.openEditCcExpenseModal = function(id) {
  openAddCcExpenseModal(id);
};

window.closeAddCcExpenseModal = function() {
  document.getElementById('addCcExpenseModal').classList.remove('active');
};

window.saveCcExpenseForm = function(event) {
  event.preventDefault();

  const id = document.getElementById('ccExpenseIdInput').value;
  const date = document.getElementById('ccExpenseDate').value;
  const amount = parseFloat(document.getElementById('ccExpenseAmount').value);
  const description = document.getElementById('ccExpenseDesc').value.trim();
  const category = document.getElementById('ccExpenseCategory').value;
  const status = document.getElementById('ccExpenseStatus').value;
  const sourcePerson = document.getElementById('ccExpensePerson').value.trim();
  
  const typeSelect = document.getElementById('ccExpenseType');
  const type = typeSelect ? typeSelect.value : 'expense';

  if (id) {
    // Edit
    const tx = state.creditCardExpenses.find(e => e.id === id);
    if (tx) {
      if (sourcePerson !== (tx.sourcePerson || '')) {
        tx.sourcePerson = sourcePerson;
        tx.splitSettled = false;
      }
      tx.date = date;
      tx.amount = amount;
      tx.description = description;
      tx.category = category;
      tx.status = status;
      tx.type = type;
      showToast(type === 'refund' ? "Refund updated!" : "Expense updated!", "success");
    }
  } else {
    // Add
    const newTx = {
      id: 'cctx-' + Date.now(),
      cardId: state.selectedCreditCardId,
      date, amount, description, category, status,
      sourcePerson: sourcePerson || '',
      splitSettled: false,
      type: type
    };
    state.creditCardExpenses.push(newTx);
    showToast(type === 'refund' ? "Refund logged!" : "Expense logged!", "success");
  }

  saveCreditCardTrackerData();
  closeAddCcExpenseModal();
  renderCreditCardDashboard();
};

window.deleteCcExpense = function(id) {
  if (!confirm("Are you sure you want to delete this credit card expense?")) return;
  state.creditCardExpenses = state.creditCardExpenses.filter(e => e.id !== id);
  saveCreditCardTrackerData();
  renderCreditCardDashboard();
  showToast("Expense deleted.", "success");
};

// 7. Core Quick Actions
window.markAllCcAsBilled = function() {
  if (!state.selectedCreditCardId) return;
  let count = 0;
  state.creditCardExpenses.forEach(e => {
    if (e.cardId === state.selectedCreditCardId && e.status === 'Unbilled') {
      e.status = 'Billed';
      count++;
    }
  });

  if (count === 0) {
    showToast("No unbilled transactions found for statement generation.", "warning");
    return;
  }

  saveCreditCardTrackerData();
  renderCreditCardDashboard();
  showToast(`Successfully moved ${count} transactions to Billed status.`, "success");
};

// 8. Record Payment Modals
window.openCcBillPaymentModal = function() {
  if (!state.selectedCreditCardId) return;

  const expenses = state.creditCardExpenses.filter(e => e.cardId === state.selectedCreditCardId);
  const unbilled = expenses.filter(e => e.status === 'Unbilled').reduce((sum, e) => sum + e.amount, 0);
  const billed = expenses.filter(e => e.status === 'Billed').reduce((sum, e) => sum + e.amount, 0);

  if (billed === 0 && unbilled === 0) {
    showToast("No outstanding dues to pay on this card!", "warning");
    return;
  }

  document.getElementById('ccPaymentDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('ccPaymentAmount').value = billed > 0 ? billed : unbilled;
  document.getElementById('ccPaymentDuesHelp').innerText = 
    `Billed Dues: ${formatCcCurrency(billed)} | Unbilled Dues: ${formatCcCurrency(unbilled)}. Record how much payment you made.`;

  // Default targets to billed if any exist, else all
  document.getElementById('ccPaymentTarget').value = billed > 0 ? 'billed' : 'all';

  document.getElementById('ccBillPaymentModal').classList.add('active');
};

window.closeCcBillPaymentModal = function() {
  document.getElementById('ccBillPaymentModal').classList.remove('active');
};

window.saveCcPaymentForm = function(event) {
  event.preventDefault();

  const amount = parseFloat(document.getElementById('ccPaymentAmount').value);
  const date = document.getElementById('ccPaymentDate').value;
  const target = document.getElementById('ccPaymentTarget').value;

  let expenses = state.creditCardExpenses.filter(e => e.cardId === state.selectedCreditCardId);
  
  if (target === 'billed') {
    expenses = expenses.filter(e => e.status === 'Billed');
  } else {
    expenses = expenses.filter(e => e.status === 'Billed' || e.status === 'Unbilled');
  }

  // Sort by date ascending (oldest first) so we pay off oldest first
  expenses.sort((a, b) => new Date(a.date) - new Date(b.date));

  let remainingPaidPool = amount;
  let markedCount = 0;

  for (let i = 0; i < expenses.length; i++) {
    const tx = expenses[i];
    if (remainingPaidPool >= tx.amount) {
      tx.status = 'Paid';
      remainingPaidPool -= tx.amount;
      markedCount++;
    } else if (remainingPaidPool > 0) {
      // Partially paid. To keep it simple: if remaining is positive but not enough for full bill, 
      // let's mark it as Paid and show warning or just cover it. Let's just mark as Paid to clear it.
      tx.status = 'Paid';
      remainingPaidPool = 0;
      markedCount++;
      break;
    } else {
      break;
    }
  }

  if (markedCount > 0) {
    saveCreditCardTrackerData();
    renderCreditCardDashboard();
    showToast(`Recorded payment! Marked ${markedCount} transactions as Paid.`, "success");
  } else {
    showToast("No transactions were marked. Check payment amount.", "warning");
  }

  closeCcBillPaymentModal();
};

// 9. NLP Quick-Logging
window.submitCcNlpExpense = function() {
  const input = document.getElementById('ccNlpInput');
  if (!input || !input.value.trim()) return;

  const text = input.value.trim();
  
  if (typeof parseTransactionText === 'function') {
    const parsed = parseTransactionText(text);
    if (parsed.amount) {
      const newTx = {
        id: 'cctx-' + Date.now(),
        cardId: state.selectedCreditCardId,
        date: parsed.date || new Date().toISOString().split('T')[0],
        amount: parsed.amount,
        description: parsed.description || "Quick Logged Expense",
        category: parsed.category || "Others",
        status: 'Unbilled',
        sourcePerson: parsed.sourcePerson || '',
        splitSettled: false,
        type: parsed.type === 'income' ? 'refund' : 'expense'
      };
      
      state.creditCardExpenses.push(newTx);
      saveCreditCardTrackerData();
      renderCreditCardDashboard();
      
      input.value = '';
      showToast(newTx.type === 'refund' ? `Logged card refund of ₹${parsed.amount}!` : `Logged ₹${parsed.amount} under "${newTx.category}"!`, "success");
    } else {
      showToast("Could not extract amount. Please check input format.", "warning");
    }
  } else {
    showToast("NLP Parser unavailable.", "error");
  }
};

// Dismiss modals on overlay click
document.getElementById('addCardModal')?.addEventListener('click', function(e) {
  if (e.target === this) closeAddCardModal();
});
document.getElementById('addCcExpenseModal')?.addEventListener('click', function(e) {
  if (e.target === this) closeAddCcExpenseModal();
});
document.getElementById('ccBillPaymentModal')?.addEventListener('click', function(e) {
  if (e.target === this) closeCcBillPaymentModal();
});
// 10. Dashboard Swapping (Home vs Credit Card)
state.activeDashboard = 'home'; // default dashboard

window.switchDashboard = function(mode) {
  state.activeDashboard = mode;

  // Toggle active styling on switcher buttons
  const btnHome = document.getElementById('dbToggleHome');
  const btnCc = document.getElementById('dbToggleCc');

  if (btnHome) {
    btnHome.classList.toggle('active', mode === 'home');
    if (mode === 'home') {
      btnHome.style.setProperty('--card-theme-color', 'var(--primary)');
    } else {
      btnHome.style.removeProperty('--card-theme-color');
    }
  }
  
  if (btnCc) {
    btnCc.classList.toggle('active', mode === 'credit-card');
    if (mode === 'credit-card') {
      btnCc.style.setProperty('--card-theme-color', 'var(--primary)');
    } else {
      btnCc.style.removeProperty('--card-theme-color');
    }
  }

  // Toggle sidebar navigation items visibility
  const navMenu = document.querySelector('.nav-menu');
  if (navMenu) {
    navMenu.classList.toggle('hidden', mode === 'credit-card');
  }

  // Toggle mobile bottom navigation bar visibility
  const mobileNav = document.querySelector('.mobile-nav-bar');
  if (mobileNav) {
    mobileNav.classList.toggle('hidden', mode === 'credit-card');
  }

  // Perform view swaps
  if (mode === 'credit-card') {
    switchTab('credit-cards');
  } else {
    switchTab('overview');
  }
};

window.handleDashboardTogglePlus = function() {
  if (state.activeDashboard === 'credit-card') {
    openAddCardModal();
  } else {
    openAddChannelModal();
  }
};

// 11. Splits Tracker Render & Settle Logic
window.renderCcSplits = function() {
  const panel = document.getElementById('ccSplitsPanel');
  const list = document.getElementById('ccSplitsList');
  if (!panel || !list) return;

  const activeSplits = state.creditCardExpenses.filter(e => e.sourcePerson && !e.splitSettled);

  if (activeSplits.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';

  // Group by sourcePerson case-insensitively
  const groups = {};
  activeSplits.forEach(tx => {
    const rawName = tx.sourcePerson.trim();
    const key = rawName.toLowerCase();
    
    // Capitalize name for cleaner display
    const formattedName = rawName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

    if (!groups[key]) {
      groups[key] = {
        name: formattedName,
        items: []
      };
    }
    groups[key].items.push(tx);
  });

  const cardsList = state.creditCards || [];

  list.innerHTML = Object.keys(groups).map(key => {
    const group = groups[key];
    const personName = group.name;
    const txs = group.items;
    
    // Calculate total owed, subtracting refunds
    const totalOwed = txs.reduce((sum, tx) => {
      if (tx.type === 'refund') {
        return sum - tx.amount;
      }
      return sum + tx.amount;
    }, 0);

    const txItemsHtml = txs.map(tx => {
      const activeCard = cardsList.find(c => c.id === tx.cardId);
      const cardName = activeCard ? activeCard.name : 'Unknown Card';
      const formattedDate = new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      
      const isRefund = tx.type === 'refund';
      const amountColor = isRefund ? 'var(--accent-income)' : 'var(--accent-expense)';
      const amountDisplay = isRefund ? `- ${formatCcCurrency(tx.amount)}` : formatCcCurrency(tx.amount);
      
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; background: rgba(0,0,0,0.15); padding: 0.4rem 0.6rem; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.03); margin-bottom: 0.4rem;">
          <div>
            <div style="font-weight: 600; color: var(--text-primary);">${tx.description}</div>
            <div style="font-size: 0.7rem; color: var(--text-muted);">${formattedDate} • ${cardName}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-weight: 700; font-family: monospace; color: ${amountColor};">${amountDisplay}</span>
            <button class="btn btn-secondary btn-xs" style="padding: 0.15rem 0.35rem; font-size: 0.65rem; border-color: rgba(var(--accent-income-rgb), 0.3); color: var(--accent-income); background: transparent; cursor: pointer; border-radius: 4px;" onclick="settleCcSplit('${tx.id}')" title="Mark Settled">✓</button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="cc-split-card" style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--glass-border); border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 0.5rem;">
          <div>
            <span style="font-weight: 700; font-size: 1.05rem; color: var(--text-primary);">${personName}</span>
            <span style="font-size: 0.7rem; color: var(--text-muted); display: block;">Owes you</span>
          </div>
          <div style="text-align: right;">
            <span style="font-size: 1.15rem; font-weight: 700; color: var(--accent-income); font-family: monospace; display: block;">${formatCcCurrency(totalOwed)}</span>
            <button class="btn btn-primary btn-xs" style="padding: 0.15rem 0.4rem; font-size: 0.65rem; margin-top: 0.2rem;" onclick="settleAllCcSplitsForPerson('${personName}')">Settle All</button>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; max-height: 140px; overflow-y: auto; padding-right: 0.15rem;">
          ${txItemsHtml}
        </div>
      </div>
    `;
  }).join('');
};

window.settleCcSplit = function(id) {
  const tx = state.creditCardExpenses.find(e => e.id === id);
  if (!tx) return;
  tx.splitSettled = true;
  saveCreditCardTrackerData();
  renderCreditCardDashboard();
  showToast("Split marked as settled!", "success");
};

window.settleAllCcSplitsForPerson = function(person) {
  if (!confirm(`Are you sure you want to settle all splits for ${person}?`)) return;
  let count = 0;
  state.creditCardExpenses.forEach(tx => {
    if (tx.sourcePerson && tx.sourcePerson.trim().toLowerCase() === person.trim().toLowerCase() && !tx.splitSettled) {
      tx.splitSettled = true;
      count++;
    }
  });
  if (count > 0) {
    saveCreditCardTrackerData();
    renderCreditCardDashboard();
    showToast(`Settled all ${count} splits for ${person}!`, "success");
  }
};
