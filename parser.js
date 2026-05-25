/**
 * parser.js - Natural Language Processing Parser for Home Expense Dashboard
 * Designed to parse simple, everyday language inputs into structured transactions.
 */

const PaymentModes = {
  CASH: 'Cash',
  ICICI: 'ICICI Amazon Pay Credit Card',
  HDFC: 'HDFC TATA Neu Credit Card',
  GOSATS: 'Go Sats Prepaid Debit Card'
};

const ExpenseCategories = [
  'Groceries',
  'Food & Dining',
  'Utilities',
  'Travel & Fuel',
  'Entertainment',
  'Shopping',
  'Medical & Health',
  'Rent & Maintenance',
  'Lent/Loan',
  'Contribution',
  'Others'
];

const IncomeCategories = [
  'Salary',
  'Personal Transfer',
  'Refund',
  'Bonus/Interest',
  'Debt Recovery',
  'Contribution',
  'Others'
];

const invalidNames = ['for', 'to', 'on', 'via', 'using', 'with', 'by', 'in', 'at', 'of', 'rs', 'inr', 'rupees', 'me', 'cash', 'card', 'icici', 'hdfc', 'sats', 'gosats', 'prepaid', 'bank', 'interest', 'salary', 'employer', 'refund', 'electricity', 'bill', 'rent', 'groceries', 'food', 'fuel', 'petrol', 'diesel', 'utility', 'utilities', 'shopping', 'medicine', 'starbucks', 'zomato', 'swiggy', 'uber', 'ola', 'movie', 'netflix', 'wifi', 'internet', 'broadband', 'mobile', 'recharge', 'dth', 'power', 'water', 'gas', 'house', 'flat', 'maid', 'cook', 'maintenance', 'society', 'insurance', 'tax', 'taxes', 'fees', 'school', 'college', 'tuition', 'gift', 'gifts', 'clothes', 'shoes', 'gadget', 'phone', 'laptop', 'device', 'ticket', 'flight', 'train', 'bus', 'hotel', 'dining', 'restaurant', 'cafe', 'pizza', 'burger', 'snacks', 'starbucks', 'starbuck', 'star', 'bucks', 'subway', 'maggi', 'kirana', 'mart', 'supermarket', 'dmart', 'd-mart', 'milk', 'vegetables', 'fruits', 'veg', 'bread', 'eggs', 'laundry', 'washer', 'dryer', 'salary', 'bonus', 'dividend', 'pocket', 'money', 'hand', 'transfer'];

/**
 * Main parse function
 * @param {string} text - User input string
 * @param {Date} baseDate - Reference date (default today)
 * @returns {object} Parsed transaction structure
 */
function parseTransactionText(text, baseDate = new Date()) {
  if (!text || text.trim() === '') {
    return {
      type: 'expense',
      amount: null,
      description: '',
      paymentMode: null,
      category: 'Others',
      sourcePerson: '',
      date: formatDate(baseDate),
      isValid: false
    };
  }

  const lowercase = text.toLowerCase();
  
  // 1. Extract Transaction Type (Income vs Expense)
  const type = extractType(lowercase);

  // 2. Extract Amount
  const amount = extractAmount(text);

  // 3. Extract Payment Mode
  const paymentMode = extractPaymentMode(lowercase, type);

  // 4. Extract Date
  const date = extractDate(text, baseDate);

  // 5. Extract Description, Category, and Source Person
  const { description, category, sourcePerson } = extractDescriptionAndCategory(text, type);

  // Determine if it is valid (must have at least an amount)
  const isValid = amount !== null && !isNaN(amount);

  return {
    type,
    amount,
    description,
    paymentMode,
    category,
    sourcePerson,
    date,
    isValid
  };
}

/**
 * Extracts the transaction type (expense or income)
 */
function extractType(lowercaseText) {
  const incomeWords = [
    'received', 'got', 'credited', 'salary', 'income', 'refund', 'bonus', 
    'earned', 'got from', 'received from', 'added', 'pocket money', 'freelance',
    'returned', 'paid back', 'got back', 'repaid', 'recovered'
  ];
  
  for (const word of incomeWords) {
    if (lowercaseText.includes(word)) {
      return 'income';
    }
  }
  return 'expense';
}

/**
 * Extracts amount, ignoring dates or years (like 2026)
 */
function extractAmount(text) {
  // Strip out dates first so numbers like YYYY or DD do not get captured as amounts
  let tempText = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');
  tempText = tempText.replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi, '');
  tempText = tempText.replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/gi, '');
  tempText = tempText.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '');

  // Look for currency tags
  const currencyRegexes = [
    /(?:rs\.?|inr|₹|rupees)\s*(\d+(?:\.\d{1,2})?)/i,
    /(\d+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|rupees|bucks)/i,
    /spent\s+(\d+(?:\.\d{1,2})?)/i,
    /paid\s+(\d+(?:\.\d{1,2})?)/i,
    /received\s+(\d+(?:\.\d{1,2})?)/i,
    /got\s+(\d+(?:\.\d{1,2})?)/i,
    /for\s+(\d+(?:\.\d{1,2})?)/i,
    /(\d+(?:\.\d{1,2})?)\s*(?:on|for|from|to|via|using|with)/i,
    /\b(\d+(?:\.\d{1,2})?)\b/ // Fallback to any standalone number
  ];

  for (const regex of currencyRegexes) {
    const match = tempText.match(regex);
    if (match) {
      const val = parseFloat(match[1]);
      // Exclude values that look like years or invalid amounts
      if (!isNaN(val) && val > 0 && val !== 2026 && val !== 2025) {
        return val;
      }
    }
  }
  return null;
}

/**
 * Extracts payment mode (primarily for expenses, fallback to Cash/null)
 */
function extractPaymentMode(lowercaseText, type) {
  if (type === 'income') {
    // For income, payment mode isn't strictly required but if they say cash/bank we can capture it
    if (lowercaseText.includes('cash')) return PaymentModes.CASH;
    if (lowercaseText.includes('icici')) return PaymentModes.ICICI;
    if (lowercaseText.includes('hdfc')) return PaymentModes.HDFC;
    if (lowercaseText.includes('go sats') || lowercaseText.includes('gosats')) return PaymentModes.GOSATS;
    return PaymentModes.CASH; // Default to Cash for income
  }

  // Expenses payment mode matches
  if (lowercaseText.includes('cash') || lowercaseText.includes('in hand') || lowercaseText.includes('by hand')) {
    return PaymentModes.CASH;
  }
  if (lowercaseText.includes('icici') || lowercaseText.includes('amazon') || lowercaseText.includes('amazon pay')) {
    return PaymentModes.ICICI;
  }
  if (lowercaseText.includes('hdfc') || lowercaseText.includes('tata') || lowercaseText.includes('neu')) {
    return PaymentModes.HDFC;
  }
  if (lowercaseText.includes('go sats') || lowercaseText.includes('gosats') || lowercaseText.includes('prepaid') || lowercaseText.includes('sats')) {
    return PaymentModes.GOSATS;
  }

  // Default fallback if not specified
  return null;
}

/**
 * Extracts relative or absolute date
 */
function extractDate(text, baseDate) {
  const lowercase = text.toLowerCase();
  
  // 1. Relative dates
  if (lowercase.includes('today')) {
    return formatDate(baseDate);
  }
  if (lowercase.includes('yesterday')) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - 1);
    return formatDate(d);
  }
  if (lowercase.includes('day before yesterday')) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - 2);
    return formatDate(d);
  }
  
  // 2. Absolute Date YYYY-MM-DD
  const yyyymmdd = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (yyyymmdd) {
    return yyyymmdd[0];
  }
  
  // 3. Slash/Dash format: DD/MM/YYYY or DD-MM-YYYY
  const slashDate = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (slashDate) {
    let day = parseInt(slashDate[1]);
    let month = parseInt(slashDate[2]) - 1; // 0-indexed
    let year = parseInt(slashDate[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return formatDate(d);
  }

  // 4. Month + Day combinations: e.g. "on 24th May", "24th May", "May 24", "on 24 May"
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  for (let m = 0; m < 12; m++) {
    const mName = months[m];
    const regexStr = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${mName}[a-z]*\\b|\\b${mName}[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');
    const match = text.match(regexStr);
    if (match) {
      const day = parseInt(match[1] || match[2]);
      const year = baseDate.getFullYear();
      const d = new Date(year, m, day);
      if (!isNaN(d.getTime())) return formatDate(d);
    }
  }
  
  // 5. Day only: e.g. "on 24th", "on 24"
  const dayOnlyMatch = text.match(/\bon\s+(\d{1,2})(?:st|nd|rd|th)?\b/i) || text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of this month)\b/i);
  if (dayOnlyMatch) {
    const day = parseInt(dayOnlyMatch[1]);
    const d = new Date(baseDate);
    d.setDate(day);
    return formatDate(d);
  }

  // Default: return baseDate (which is typically today's date)
  return formatDate(baseDate);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Extracts cleaned description, categorizes, and gets source person
 */
function extractDescriptionAndCategory(text, type) {
  const lowercase = text.toLowerCase();
  let cleaned = text;

  // Remove amount values
  cleaned = cleaned.replace(/(?:rs\.?|inr|₹|rupees)?\s*\d+(?:\.\d{1,2})?\s*(?:rs\.?|inr|₹|rupees|bucks)?/gi, '');
  
  // Remove dates
  cleaned = cleaned.replace(/\b(?:today|yesterday|day before yesterday)\b/gi, '');
  cleaned = cleaned.replace(/\bd{4}-\d{2}-\d{2}\b/g, '');
  cleaned = cleaned.replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi, '');
  cleaned = cleaned.replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/gi, '');
  cleaned = cleaned.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '');
  cleaned = cleaned.replace(/\bon\s+\d{1,2}(?:st|nd|rd|th)?\b/gi, '');

  // Remove payment mode mentions
  cleaned = cleaned.replace(/\b(?:via|using|with|by|through|card|prepaid|credit card|credit|debit card|debit|mode)?\s*(?:cash|in hand|icici|amazon|amazon pay|hdfc|tata|neu|tata neu|go sats|gosats|sats)\b/gi, '');
  
  // Clean action words
  cleaned = cleaned.replace(/\b(?:spent|spent on|paid|paid for|bought|buy|purchased|purchase|shopping|received|got|credited|salary|bonus|income|refund|got from|received from|lent|loaned|gave|gifted|returned|paid back|repaid|repay|recovered|got back|back from)\b/gi, '');
  
  // Remove prepositions
  cleaned = cleaned.replace(/\b(?:on|for|from|to|a|an|the|of|in|at)\b/gi, '');
  
  // Clean whitespace
  cleaned = cleaned.trim().replace(/\s+/g, ' ');
  
  // Fallback description
  let finalDesc = cleaned || (type === 'income' ? 'Income Received' : 'Miscellaneous Expense');
  
  // Capitalize first letter
  finalDesc = finalDesc.charAt(0).toUpperCase() + finalDesc.slice(1);
  
  let category = 'Others';
  let sourcePerson = '';

  // 1. Check for Loans / Money Lent (Expenses)
  if (type === 'expense') {
    const lentToMatch = text.match(/\b(?:lent|loaned|gave|gifted|sent|paid)\s+(?:(?:rs\.?|inr|₹|rupees)?\s*\d+(?:\.\d{1,2})?\s*(?:rs\.?|inr|₹|rupees|bucks)?\s*)?(?:to\s+)?([A-Za-z]+)\b/i) ||
                        text.match(/\b(?:lent|loaned|gave|gifted|sent|paid)\s+([A-Za-z]+)\s+(?:(?:rs\.?|inr|₹|rupees)?\s*\d+(?:\.\d{1,2})?)\b/i);
    if (lentToMatch) {
      const name = lentToMatch[1].trim();
      if (!invalidNames.includes(name.toLowerCase())) {
        sourcePerson = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        category = 'Lent/Loan';
        finalDesc = `Lent to ${sourcePerson}`;
      }
    }
  }

  // 2. Check for Debt Recovery / Return (Incomes)
  if (type === 'income') {
    const returnFromMatch = text.match(/\b([A-Za-z]+)\s+(?:returned|paid\s+back|repaid|repay|gave\s+back)\b/i) ||
                            text.match(/\b(?:got|received|recovered|back)\s+(?:(?:rs\.?|inr|₹|rupees)?\s*\d+(?:\.\d{1,2})?\s*(?:rs\.?|inr|₹|rupees|bucks)?\s*)?(?:back\s+)?from\s+([A-Za-z]+)\b/i);
    if (returnFromMatch) {
      const name = (returnFromMatch[1] || returnFromMatch[2]).trim();
      if (!invalidNames.includes(name.toLowerCase())) {
        sourcePerson = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        category = 'Debt Recovery';
        finalDesc = `Recovered from ${sourcePerson}`;
      }
    }
  }

  // 3. Fallback standard categorization if not a loan transaction
  if (category === 'Others') {
    if (type === 'income') {
      category = 'Salary';
      // Try to extract person after "from [name]"
      const fromMatch = text.match(/\bfrom\s+([A-Za-z0-9\s]+?)(?:\s+for|\s+via|\s+on|\s+today|\s+yesterday|\s+in|$)/i);
      if (fromMatch) {
        sourcePerson = fromMatch[1].trim();
        // Capitalize names
        sourcePerson = sourcePerson.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        category = 'Personal Transfer';
        finalDesc = `From ${sourcePerson}`;
      } else {
        const salaryWords = ['salary', 'employer', 'company', 'bonus', 'dividend', 'interest', 'refund', 'contribution', 'contribute'];
        for (const sw of salaryWords) {
          if (lowercase.includes(sw)) {
            if (sw === 'refund') category = 'Refund';
            else if (sw === 'salary') category = 'Salary';
            else if (sw === 'bonus' || sw === 'interest' || sw === 'dividend') category = 'Bonus/Interest';
            else if (sw === 'contribution' || sw === 'contribute') category = 'Contribution';
            break;
          }
        }
      }
    } else {
      // Expense Auto-categorization
      const categoriesMap = {
        'Groceries': ['grocery', 'groceries', 'milk', 'vegetables', 'fruits', 'veg', 'supermarket', 'mart', 'kirana', 'bread', 'eggs'],
        'Food & Dining': ['swiggy', 'zomato', 'restaurant', 'food', 'dining', 'hotel', 'lunch', 'dinner', 'breakfast', 'tea', 'coffee', 'starbucks', 'snacks', 'pizza', 'burger', 'cafe', 'subway', 'maggi'],
        'Utilities': ['electricity', 'water', 'gas', 'bill', 'recharge', 'wifi', 'internet', 'broadband', 'mobile', 'dth', 'power', 'phone bill'],
        'Travel & Fuel': ['petrol', 'diesel', 'fuel', 'cab', 'uber', 'ola', 'auto', 'metro', 'train', 'flight', 'ticket', 'travel', 'bus', 'parking', 'toll'],
        'Entertainment': ['movie', 'netflix', 'prime', 'spotify', 'theatre', 'game', 'gaming', 'concert', 'show', 'hotstar', 'cinema', 'bookmyshow'],
        'Shopping': ['amazon', 'flipkart', 'myntra', 'clothes', 'shoes', 'gift', 'shopping', 'apparel', 'gadget', 'phone', 'laptop', 'device'],
        'Medical & Health': ['medicine', 'medical', 'hospital', 'doctor', 'clinic', 'pharmacy', 'health', 'gym', 'workout', 'labs', 'test'],
        'Rent & Maintenance': ['rent', 'maid', 'cook', 'maintenance', 'society', 'lease', 'deposit'],
        'Contribution': ['contribution', 'contribute', 'share', 'pooled']
      };
      
      for (const [cat, keywords] of Object.entries(categoriesMap)) {
        for (const kw of keywords) {
          if (lowercase.includes(kw)) {
            category = cat;
            break;
          }
        }
        if (category !== 'Others') break;
      }
    }
  }
  
  return { description: finalDesc, category, sourcePerson };
}

function parseCompoundTransactionText(text, baseDate = new Date()) {
  if (!text || text.trim() === '') {
    return [parseTransactionText(text, baseDate)];
  }

  const lowercase = text.toLowerCase();
  
  // Find all numbers in the text to see if it is a compound statement
  const numbers = text.match(/\b\d+(?:\.\d{1,2})?\b/g);
  
  if (numbers && numbers.length > 1 && (lowercase.includes(' and ') || lowercase.includes(',') || lowercase.includes(';'))) {
    // Split text by "and", ",", or ";"
    const clauses = text.split(/\band\b|;|,/gi);
    const results = [];
    
    let lastType = 'expense';
    let lastCategory = 'Others';
    let lastPerson = '';
    let lastPaymentMode = null;
    
    clauses.forEach(clause => {
      const trimmed = clause.trim();
      if (trimmed === '') return;
      
      const parsed = parseTransactionText(trimmed, baseDate);
      
      if (parsed.isValid) {
        // If single parser didn't find a name, try to extract to/from [Name] directly from clause
        if (parsed.sourcePerson === '') {
          const toMatch = trimmed.match(/\b(?:to\s+)([A-Za-z]+)\b/i);
          const fromMatch = trimmed.match(/\b(?:from\s+)([A-Za-z]+)\b/i);
          let name = '';
          if (toMatch) name = toMatch[1];
          else if (fromMatch) name = fromMatch[1];
          
          if (name && !invalidNames.includes(name.toLowerCase())) {
            parsed.sourcePerson = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
          }
        }

        // Inherit person from previous if STILL missing and same person context exists
        if (parsed.sourcePerson === '' && lastPerson !== '') {
          if (trimmed.toLowerCase().includes(lastPerson.toLowerCase())) {
            parsed.sourcePerson = lastPerson;
          }
        }
        
        // Inherit category if Lent/Loan and matches person context
        if (parsed.category === 'Others' && lastCategory === 'Lent/Loan') {
          if (parsed.sourcePerson !== '' || trimmed.toLowerCase().includes('to ')) {
            parsed.category = 'Lent/Loan';
            if (parsed.sourcePerson === '' && lastPerson !== '') {
              parsed.sourcePerson = lastPerson;
            }
            parsed.description = `Lent to ${parsed.sourcePerson}`;
          }
        }
        
        // Inherit payment mode if missing
        if (parsed.paymentMode === null && lastPaymentMode !== null) {
          parsed.paymentMode = lastPaymentMode;
        }

        // Save these as context for the next clause
        if (parsed.sourcePerson !== '') lastPerson = parsed.sourcePerson;
        if (parsed.category !== 'Others') lastCategory = parsed.category;
        if (parsed.type) lastType = parsed.type;
        if (parsed.paymentMode) lastPaymentMode = parsed.paymentMode;
        
        results.push(parsed);
      }
    });
    
    if (results.length > 0) {
      return results;
    }
  }
  
  return [parseTransactionText(text, baseDate)];
}

// Export for browser usage (global scope)
if (typeof window !== 'undefined') {
  window.PaymentModes = PaymentModes;
  window.ExpenseCategories = ExpenseCategories;
  window.IncomeCategories = IncomeCategories;
  window.parseTransactionText = parseTransactionText;
  window.parseCompoundTransactionText = parseCompoundTransactionText;
}
