/**
 * Admin Analytics Page Controller - Powered by Chart.js
 */

import { api } from '../api.js';
import { requireAuth, renderNavbar } from '../auth.js';
import { showToast } from '../toast.js';

let timelineChart = null;
let statusChart = null;
let clauseChart = null;
let tokenChart = null;
let cachedAnalyticsData = null;

document.addEventListener('DOMContentLoaded', async () => {
  const admin = requireAuth(['admin']);
  if (!admin) return;

  renderNavbar('admin-analytics');

  document.getElementById('refreshAnalyticsBtn').addEventListener('click', () => loadAnalytics());

  window.addEventListener('themechanged', () => {
    if (cachedAnalyticsData) {
      renderCharts(cachedAnalyticsData);
    }
  });

  await loadAnalytics();
});

async function loadAnalytics() {
  try {
    const data = await api.get('/admin/analytics');
    cachedAnalyticsData = data;
    updateKPIs(data);
    renderCharts(data);
  } catch (err) {
    showToast('Failed to load analytics: ' + err.message, 'danger');
  }
}

function updateKPIs(data) {
  // Processed
  document.getElementById('kpiProcessed').textContent = data.contracts_processed || 0;

  // Avg Risk
  const avg = data.avg_risk_score || 0;
  document.getElementById('kpiAvgScore').textContent = `${avg}/100`;

  let band = 'LOW RISK';
  if (avg >= 67) band = 'HIGH RISK';
  else if (avg >= 34) band = 'MEDIUM RISK';
  document.getElementById('kpiAvgBand').textContent = `Benchmark Band: ${band}`;

  // Top Clause
  if (data.top_flagged_clause_types && data.top_flagged_clause_types.length > 0) {
    const top = data.top_flagged_clause_types[0];
    document.getElementById('kpiTopClause').textContent = formatClauseTitle(top.clause_type);
    document.getElementById('kpiTopClauseCount').textContent = `${top.flag_count} contract flags recorded`;
  } else {
    document.getElementById('kpiTopClause').textContent = 'None yet';
    document.getElementById('kpiTopClauseCount').textContent = 'No findings recorded';
  }

  // AI Tokens
  let totalTokens = 0;
  if (data.api_usage && Array.isArray(data.api_usage)) {
    data.api_usage.forEach((u) => {
      totalTokens += parseInt(u.tokens_in || 0, 10) + parseInt(u.tokens_out || 0, 10);
    });
  }
  document.getElementById('kpiTotalTokens').textContent = totalTokens.toLocaleString();
}

function getThemeChartPalette() {
  const theme = document.documentElement.getAttribute('data-theme') || 'claymorphism';
  if (theme === 'monochrome') {
    return {
      line: '#09090B',
      lineBg: 'rgba(9, 9, 11, 0.08)',
      status: ['#09090B', '#3F3F46', '#71717A', '#A1A1AA', '#D4D4D8'],
      high: '#09090B',
      med: '#71717A',
      low: '#A1A1AA',
      tokenIn: '#27272A',
      tokenOut: '#71717A',
      grid: '#E4E4E7',
      text: '#09090B',
    };
  }
  if (theme === 'neo-brutalism') {
    return {
      line: '#8B5CF6',
      lineBg: 'rgba(255, 230, 0, 0.4)',
      status: ['#FF5757', '#00E599', '#FFE600', '#38BDF8', '#8B5CF6'],
      high: '#FF5757',
      med: '#FFE600',
      low: '#00E599',
      tokenIn: '#38BDF8',
      tokenOut: '#8B5CF6',
      grid: '#CBD5E1',
      text: '#000000',
    };
  }
  if (theme === 'material-you') {
    return {
      line: '#6750A4',
      lineBg: 'rgba(234, 221, 255, 0.45)',
      status: ['#B3261E', '#146C2E', '#8A5100', '#49454F', '#21005D'],
      high: '#B3261E',
      med: '#8A5100',
      low: '#146C2E',
      tokenIn: '#6750A4',
      tokenOut: '#7D5260',
      grid: '#E7E0EC',
      text: '#1D1B20',
    };
  }
  if (theme === 'neumorphism') {
    return {
      line: '#4D7CFE',
      lineBg: 'rgba(77, 124, 254, 0.12)',
      status: ['#D32F2F', '#2E7D32', '#E65100', '#757575', '#31344B'],
      high: '#D32F2F',
      med: '#E65100',
      low: '#2E7D32',
      tokenIn: '#4D7CFE',
      tokenOut: '#9C27B0',
      grid: '#D1D5DB',
      text: '#31344B',
    };
  }
  if (theme === 'glassmorphism') {
    return {
      line: '#818CF8',
      lineBg: 'rgba(129, 140, 248, 0.25)',
      status: ['rgba(239, 68, 68, 0.85)', 'rgba(16, 185, 129, 0.85)', 'rgba(245, 158, 11, 0.85)', 'rgba(100, 116, 139, 0.85)', 'rgba(99, 102, 241, 0.85)'],
      high: 'rgba(239, 68, 68, 0.85)',
      med: 'rgba(245, 158, 11, 0.85)',
      low: 'rgba(16, 185, 129, 0.85)',
      tokenIn: 'rgba(56, 189, 248, 0.85)',
      tokenOut: 'rgba(168, 85, 247, 0.85)',
      grid: 'rgba(203, 213, 225, 0.5)',
      text: '#1E293B',
    };
  }
  // Default Claymorphism
  return {
    line: '#6366F1',
    lineBg: 'rgba(99, 102, 241, 0.15)',
    status: ['#EF4444', '#10B981', '#F59E0B', '#64748B', '#1E293B'],
    high: '#EF4444',
    med: '#F59E0B',
    low: '#10B981',
    tokenIn: '#3B82F6',
    tokenOut: '#8B5CF6',
    grid: '#E2E8F0',
    text: '#1E293B',
  };
}

function renderCharts(data) {
  if (!window.Chart) return;
  const p = getThemeChartPalette();

  // 1. Ingestion Timeline Chart
  const timelineCtx = document.getElementById('timelineChart').getContext('2d');
  if (timelineChart) timelineChart.destroy();

  const days = (data.contracts_per_day || []).map((d) => d.day);
  const dayCounts = (data.contracts_per_day || []).map((d) => parseInt(d.count, 10));

  timelineChart = new window.Chart(timelineCtx, {
    type: 'line',
    data: {
      labels: days.length > 0 ? days : ['Today'],
      datasets: [
        {
          label: 'Contracts Uploaded',
          data: dayCounts.length > 0 ? dayCounts : [data.contracts_processed || 1],
          borderColor: p.line,
          backgroundColor: p.lineBg,
          borderWidth: 3,
          fill: true,
          tension: 0.35,
          pointRadius: 5,
          pointBackgroundColor: p.line,
          pointHoverRadius: 7,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0, color: p.text }, grid: { color: p.grid } },
        x: { ticks: { color: p.text }, grid: { color: p.grid } },
      },
    },
  });

  // 2. Status Distribution Donut Chart
  const statusCtx = document.getElementById('statusChart').getContext('2d');
  if (statusChart) statusChart.destroy();

  const breakdown = data.status_breakdown || {};
  const statusLabels = Object.keys(breakdown);
  const statusCounts = Object.values(breakdown);

  statusChart = new window.Chart(statusCtx, {
    type: 'doughnut',
    data: {
      labels: statusLabels.map((s) => s.toUpperCase()),
      datasets: [
        {
          data: statusCounts.length > 0 ? statusCounts : [1],
          backgroundColor: p.status,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: p.text } },
      },
    },
  });

  // 3. Top Flagged Clauses Bar Chart
  const clauseCtx = document.getElementById('clauseChart').getContext('2d');
  if (clauseChart) clauseChart.destroy();

  const clauses = data.top_flagged_clause_types || [];
  clauseChart = new window.Chart(clauseCtx, {
    type: 'bar',
    data: {
      labels: clauses.map((c) => formatClauseTitle(c.clause_type)),
      datasets: [
        {
          label: 'High Risk Flags',
          data: clauses.map((c) => parseInt(c.high_count || 0, 10)),
          backgroundColor: p.high,
        },
        {
          label: 'Medium Risk Flags',
          data: clauses.map((c) => parseInt(c.medium_count || 0, 10)),
          backgroundColor: p.med,
        },
        {
          label: 'Low Risk Flags',
          data: clauses.map((c) => parseInt(c.low_count || 0, 10)),
          backgroundColor: p.low,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { color: p.text }, grid: { color: p.grid } },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0, color: p.text }, grid: { color: p.grid } },
      },
      plugins: {
        legend: { position: 'top', labels: { color: p.text } },
      },
    },
  });

  // 4. Token Consumption Breakdown Chart
  const tokenCtx = document.getElementById('tokenChart').getContext('2d');
  if (tokenChart) tokenChart.destroy();

  const usage = data.api_usage || [];
  tokenChart = new window.Chart(tokenCtx, {
    type: 'bar',
    data: {
      labels: usage.map((u) => u.service.toUpperCase()),
      datasets: [
        {
          label: 'Tokens In (Prompt/Text)',
          data: usage.map((u) => parseInt(u.tokens_in || 0, 10)),
          backgroundColor: p.tokenIn,
        },
        {
          label: 'Tokens Out (Completions)',
          data: usage.map((u) => parseInt(u.tokens_out || 0, 10)),
          backgroundColor: p.tokenOut,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, ticks: { color: p.text }, grid: { color: p.grid } },
        x: { ticks: { color: p.text }, grid: { color: p.grid } },
      },
      plugins: {
        legend: { position: 'top', labels: { color: p.text } },
      },
    },
  });
}

function formatClauseTitle(type) {
  if (!type) return 'General';
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

