/**
 * charts.js - Chart.js integrations for rendering expense and payment channel data
 */

let categoryChartInstance = null;
let paymentChartInstance = null;

/**
 * Draws all analytics graphs for the current active month's transaction set
 * @param {Array} monthTxs - Array of transaction objects for the selected month
 */
function drawCharts(monthTxs) {
  // If Chart.js isn't loaded from CDN yet, skip
  if (typeof Chart === 'undefined') {
    console.warn("Chart.js is not loaded from CDN.");
    return;
  }

  // Filter out expenses
  const expenses = monthTxs.filter(tx => tx.type === 'expense');

  // Draw charts
  drawCategoryChart(expenses);
  drawPaymentChart(expenses);
}

/**
 * Renders the Doughnut Chart for category breakdowns
 */
function drawCategoryChart(expenses) {
  const canvas = document.getElementById('categoryChartCanvas');
  if (!canvas) return;

  // Clean old instance
  if (categoryChartInstance) {
    categoryChartInstance.destroy();
  }

  // Group expenses by category
  const categories = {};
  expenses.forEach(tx => {
    categories[tx.category] = (categories[tx.category] || 0) + tx.amount;
  });

  const labels = Object.keys(categories);
  const data = Object.values(categories);

  // If no expenses, show empty doughnut
  if (labels.length === 0) {
    labels.push('No Expenses');
    data.push(1); // placeholder
  }

  // Visual Palette
  const colors = [
    '#f43f5e', // Food & Dining - Rose
    '#3b82f6', // Utilities - Blue
    '#10b981', // Groceries - Emerald
    '#eab308', // Travel & Fuel - Yellow
    '#8b5cf6', // Entertainment - Violet
    '#ec4899', // Shopping - Pink
    '#06b6d4', // Medical & Health - Cyan
    '#f97316', // Rent & Maintenance - Orange
    '#64748b'  // Others - Slate
  ];

  const style = getComputedStyle(document.documentElement);
  const textColor = style.getPropertyValue('--text-secondary').trim() || '#94a3b8';
  const bgSecondary = style.getPropertyValue('--bg-secondary').trim() || '#0f162a';

  categoryChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: labels[0] === 'No Expenses' ? ['rgba(255,255,255,0.05)'] : colors.slice(0, labels.length),
        borderColor: bgSecondary,
        borderWidth: 2,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: textColor,
            font: {
              family: 'Plus Jakarta Sans',
              size: 11
            },
            padding: 15,
            usePointStyle: true
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              if (context.label === 'No Expenses') return ' No expenses recorded';
              const val = context.raw;
              return ` ₹${val.toLocaleString('en-IN')}`;
            }
          }
        }
      },
      cutout: '70%'
    }
  });
}

/**
 * Renders Horizontal Bar Chart for spent details by Payment Modes
 */
function drawPaymentChart(expenses) {
  const canvas = document.getElementById('paymentChartCanvas');
  if (!canvas) return;

  // Clean old instance
  if (paymentChartInstance) {
    paymentChartInstance.destroy();
  }

  // Calculate totals by mode
  const totals = {
    [PaymentModes.CASH]: 0,
    [PaymentModes.ICICI]: 0,
    [PaymentModes.HDFC]: 0,
    [PaymentModes.GOSATS]: 0
  };

  expenses.forEach(tx => {
    if (tx.paymentMode in totals) {
      totals[tx.paymentMode] += tx.amount;
    }
  });

  const labels = [
    'Cash',
    'ICICI Amazon CC',
    'HDFC TATA Neu CC',
    'Go Sats Prepaid'
  ];
  const data = [
    totals[PaymentModes.CASH],
    totals[PaymentModes.ICICI],
    totals[PaymentModes.HDFC],
    totals[PaymentModes.GOSATS]
  ];

  // Colors mapping for cards
  const colors = [
    '#10b981', // Emerald
    '#ff9900', // Amazon Gold
    '#004b87', // HDFC Blue
    '#7f00ff'  // Go Sats Violet
  ];

  const style = getComputedStyle(document.documentElement);
  const textColor = style.getPropertyValue('--text-secondary').trim() || '#94a3b8';
  const gridColor = style.getPropertyValue('--glass-border').trim() || 'rgba(255, 255, 255, 0.05)';

  paymentChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Spent Amount (₹)',
        data: data,
        backgroundColor: colors,
        borderRadius: 6,
        barThickness: 16
      }]
    },
    options: {
      indexAxis: 'y', // Makes it horizontal!
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false // Hide legend
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ` ₹${context.raw.toLocaleString('en-IN')}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: gridColor
          },
          ticks: {
            color: textColor,
            font: {
              family: 'Plus Jakarta Sans',
              size: 10
            },
            callback: function(value) {
              return '₹' + value;
            }
          }
        },
        y: {
          grid: {
            display: false
          },
          ticks: {
            color: textColor,
            font: {
              family: 'Plus Jakarta Sans',
              size: 11,
              weight: 'bold'
            }
          }
        }
      }
    }
  });
}

// Bind to window global space
if (typeof window !== 'undefined') {
  window.drawCharts = drawCharts;
}
